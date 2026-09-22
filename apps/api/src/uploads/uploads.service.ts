// ============================================================================
// uploads.service.ts —— 上传模块的「服务」（Service），真正干活的地方
//
// saveImage() 一共做四件事：
//   1. 校验文件（必须是图片、体积不能超上限）
//   2. 把图片统一转成 WebP 格式（体积更小、浏览器都支持）
//   3. 选存储位置：配了阿里云 OSS 就存 OSS，否则存本地磁盘
//   4. 返回一个浏览器能直接访问的 URL
// ============================================================================
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config' // 读取环境变量 / .env 配置
import { randomUUID } from 'node:crypto' // 生成 UUID 作为随机文件名
import { mkdir, writeFile } from 'node:fs/promises' // 异步文件操作（不阻塞事件循环）
import { join } from 'node:path'
import OSS from 'ali-oss' // 阿里云 OSS 官方 SDK（6.x 不自带类型，需 @types/ali-oss）
import sharp from 'sharp' // 图片处理库（底层是 libvips），用来转 WebP
import { ErrorCodes } from '@devshare/shared' // 前后端共用的错误码枚举

/**
 * 转换后的图片数据结构。
 * 统一成 WebP 之后，所有存储方式都只处理这一种格式，逻辑更简单。
 */
interface WebpImage {
  buffer: Buffer // 图片二进制内容
  ext: string // 扩展名，固定为 .webp（也用来拼 OSS 的对象名）
  mimetype: string // MIME 类型，固定为 image/webp
}

// @Injectable() 表示这个类交给 Nest 的依赖注入容器管理，可以被注入到别处
@Injectable()
export class UploadsService {
  // Logger 是 Nest 内置日志工具，输出会自动带上时间与上下文（这里是 UploadsService）
  private readonly logger = new Logger(UploadsService.name)

  // 注入 ConfigService 后，就能用 this.config.get('XXX') 读取配置了
  constructor(private readonly config: ConfigService) {}

  /**
   * 保存上传的图片（统一转成 WebP），返回可访问的 URL。
   * @param file multer 解析好的文件对象（常用字段 originalname / mimetype / size / buffer）
   * @returns url 图片地址；mode 表示实际用的是 OSS 还是本地磁盘
   */
  async saveImage(file: Express.Multer.File): Promise<{ url: string; mode: 'oss' | 'local' }> {
    // 允许的最大体积（MB），读不到配置就用默认 5
    const maxMb = Number(this.config.get<string>('MAX_FILE_SIZE_MB') ?? 5)

    // 校验一：mimetype 形如 "image/png" / "image/jpeg"，不是图片直接返回 400。
    // 抛 BadRequestException 就是 HTTP 400，并把错误码带给前端，方便前端显示多语言文案。
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException({
        code: ErrorCodes.UNSUPPORTED_FILE_TYPE,
        message: '仅支持图片文件',
      })
    }

    // 校验二：体积超限也返回 400。
    // 限制的是「原图」大小：即使转成 WebP 后会变小，也不能放过超大文件，
    // 因为解码一张几千万像素的图非常吃内存（这也是常见的攻击方式）。
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException({
        code: ErrorCodes.UPLOAD_TOO_LARGE,
        message: `图片不能超过 ${maxMb}MB`,
      })
    }

    // 核心步骤：不管上传的是 jpg / png / gif，先统一转成 WebP，后面两条存储路径就只用处理一种格式
    const image = await this.toWebp(file)

    // 有 OSS_REGION + OSS_BUCKET 就走对象存储（生产环境推荐）；否则退化成存本地磁盘。
    // 这种「按配置切换实现」的写法很常见：开发环境不申请云账号也能跑起来。
    const region = this.config.get<string>('OSS_REGION')
    const bucket = this.config.get<string>('OSS_BUCKET')

    if (region && bucket) {
      const url = await this.uploadToOss(image)
      return {
        url,
        mode: 'oss',
      }
    }

    return {
      url: await this.saveLocal(image),
      mode: 'local',
    }
  }

  /**
   * 把任意格式的图片转换成 WebP。
   *
   * 为什么统一转 WebP：
   *   - 同样画质下比 JPG/PNG 小 25%~35%，省流量也省 OSS 存储费
   *   - 支持透明通道（PNG 的特性）和动图（GIF 的特性），一种格式全搞定
   *   - 所有现代浏览器都支持
   * 顺带还能干掉 EXIF（相册、手机型号等隐私信息）——sharp 默认不保留元数据。
   */
  private async toWebp(file: Express.Multer.File): Promise<WebpImage> {
    try {
      const buffer = await sharp(file.buffer, {
        // animated: true 表示「把动图的所有帧都读进来」。
        // 不加这个选项，sharp 默认只读第一帧，GIF 动图会直接变成静态图。
        // 说明：转出来的 WebP 能否仍然播放动画，取决于 libvips 编译时的 WebP 动图支持，
        // 上线前建议拿一张真实 GIF 实测确认。
        animated: true,
      })
        // rotate() 不带参数 = 按 EXIF 里的方向信息自动摆正，
        // 否则手机拍的照片会被「躺倒」显示
        .rotate()
        // quality 是画质 0~100（82 是体积/画质的常见平衡点）；
        // effort 是压缩努力程度 0~6，越大压缩得越狠但越慢
        .webp({ quality: 82, effort: 4 })
        .toBuffer()

      return { buffer, ext: '.webp', mimetype: 'image/webp' }
    } catch (err) {
      // 走到这里说明 sharp 解不开这个文件：可能是文件被改坏了、伪装成图片的其它文件、
      // 或者是不支持的格式（如 SVG 里的某些特性）。对使用者来说都属于「这图不能用」。
      this.logger.warn(`convert to webp failed: ${file.originalname} - ${(err as Error).message}`)
      throw new BadRequestException({
        code: ErrorCodes.UNSUPPORTED_FILE_TYPE,
        message: '图片无法解析，请换一张图片重试',
      })
    }
  }

  /**
   * 存到本地磁盘，并拼出可访问的 URL。
   * 目录按「年/月」分片（如 uploads/2026/09/），避免单个目录堆积几十万个文件。
   */
  private async saveLocal(image: WebpImage): Promise<string> {
    const dir = this.config.get<string>('UPLOAD_DIR') ?? 'uploads'

    // 使用 UTC 时间生成 2026/09 这样的子目录：
    // getUTCMonth() 从 0 开始所以要 +1；padStart(2, '0') 把 9 补成 "09"，保证目录名长度统一
    const date = new Date()
    const sub = `${date.getUTCFullYear()}/` + `${String(date.getUTCMonth() + 1).padStart(2, '0')}`

    // 文件名用 UUID 重新生成（此时扩展名一定是 .webp）。
    // 这一步很重要：直接用用户上传的原始文件名可能包含 ../ 等路径穿越字符，有安全风险，
    // 也容易造成同名文件互相覆盖。
    const filename = `${randomUUID()}${image.ext}`

    // 写入前先确保目录存在：recursive: true 会一次性创建多级目录，目录已存在也不报错
    const targetDir = join(process.cwd(), dir, sub)
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, filename), image.buffer)

    // 拼出完整访问地址，前端拿到后直接放进 <img :src> 即可。
    // 生产环境要配置 PUBLIC_API_URL 成真实域名，否则会返回 localhost 地址。
    // 注意：能这样返回，是因为 uploads.module.ts 里用 ServeStaticModule 把该目录挂成了静态资源。
    const publicUrl = this.config.get<string>('PUBLIC_API_URL') ?? 'http://localhost:3000'
    return `${publicUrl}/uploads/${sub}/${filename}`
  }

  /**
   * 上传到阿里云 OSS（对象存储）。
   * 用官方 SDK 就省去了自己拼签名、拼请求头的过程，SDK 内部会处理鉴权、重试等细节。
   */
  private async uploadToOss(image: WebpImage): Promise<string> {
    // 末尾的 ! 是 TS 的「非空断言」：告诉编译器这里一定有值。
    // 调用方已经确认过 region / bucket 存在；但下面三个 key 若没配置会读到 undefined，
    // 所以生产环境必须把 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_PUBLIC_URL 都配上。
    const region = this.config.get<string>('OSS_REGION')!
    const bucket = this.config.get<string>('OSS_BUCKET')!
    const accessKeyId = this.config.get<string>('OSS_ACCESS_KEY_ID')!
    const accessKeySecret = this.config.get<string>('OSS_ACCESS_KEY_SECRET')!
    const publicUrl = this.config.get<string>('OSS_PUBLIC_URL')!

    // 1) 创建 OSS 客户端。
    //    注意：每次上传都 new 一个会浪费连接开销，实际项目里通常把它做成单例
    //    （比如在构造函数里创建，或封装成单独的 OssService）。
    const client = new OSS({
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
    })

    const date = new Date()

    // 2) OSS 里的「对象名」(key)，按年/月分片 + UUID 命名，避免重名也避免目录过深
    const key =
      `uploads/${date.getUTCFullYear()}/` +
      `${String(date.getUTCMonth() + 1).padStart(2, '0')}/` +
      `${randomUUID()}${image.ext}`

    // 3) 上传。SDK 会自己算签名并带上 Authorization 头，body 直接给 Buffer 即可。
    //    put(key, content, options)，options.headers 可以附加 OSS 支持的 HTTP 头。
    try {
      await client.put(key, image.buffer, {
        headers: {
          'Content-Type': image.mimetype,

          // ⭐ 浏览器缓存 1 年：这种 UUID 命名的文件内容永远不会变，可以放心长期缓存。
          // 31536000 = 365 天的秒数；immutable 告诉浏览器「本地有缓存就别再发请求了」
          'Cache-Control': 'public,max-age=31536000,immutable',
        },
      })
    } catch (err) {
      // 把 OSS 返回的详细错误写进服务端日志便于排查；
      // 但不要把细节抛给前端（可能泄露账号、bucket 等信息），前端只给通用提示。
      this.logger.error(`OSS upload failed: ${(err as Error).message}`)
      throw new BadRequestException({
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'OSS 上传失败',
      })
    }

    // 4) 对外返回可访问地址。用 OSS_PUBLIC_URL 而不是 SDK 的 endpoint，
    //    这样以后想切 CDN 域名只改环境变量即可。
    return `${publicUrl}/${key}`
  }
}
