// ============================================================================
// uploads.service.ts —— 上传模块的「服务」（Service），真正干活的地方
//
// 图片与视频走同一条链路：**浏览器直传 OSS**。服务端只做两件事：
//   1. config —— 告诉前端控件能不能用、体积上限多少、收哪些格式；
//   2. sts    —— 用长期 AccessKey 换一张只对**单个对象名**有效的 STS 临时凭证。
// 文件体不经过 Node 与 nginx，所以 4GB 的视频、20MB 的图片都不受 nginx
// client_max_body_size 与 multer 内存缓冲限制。
// ============================================================================
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config' // 读取环境变量 / .env 配置
import { randomUUID } from 'node:crypto' // 生成 UUID 作为随机对象名
import OSS from 'ali-oss' // 阿里云 OSS 官方 SDK（6.x 不自带类型，需 @types/ali-oss）
import {
  ErrorCodes,
  IMAGE_MIME_EXT,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_EXT,
  VIDEO_MIME_TYPES,
  type ImageUploadConfig,
  type OssUploadSts,
  type VideoUploadConfig,
} from '@devshare/shared' // 前后端共用的错误码 / 上传约定
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator'

/// STS 临时凭证有效期（秒）的默认值。AssumeRole 的下限是 900 秒，上限受角色的
/// MaxSessionDuration 限制（新角色默认 3600）。浏览器侧 SDK 会在到期前自动续签。
const DEFAULT_STS_DURATION_SECONDS = 3600

/// AssumeRole 允许的最短有效期（秒），配得比它小会被 OSS 拒绝，所以这里直接抬到下限
const MIN_STS_DURATION_SECONDS = 900

/// 服务端生成的对象名形状。续签时前端会把首次签发的 key 带回来，必须仍是这个形状，
/// 否则等于放任前端指定任意路径。
const IMAGE_KEY_PATTERN = /^uploads\/images\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/
const VIDEO_KEY_PATTERN = /^uploads\/videos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(mp4|webm)$/

/// 合法的角色 ARN 形状：acs:ram::<账号ID>:role/<角色名>。
/// 最常见的错法是把 RAM **用户**的 ARN（...:user/xxx）填进来——AssumeRole 只会回一句
/// EntityNotExist.Role，看着像权限问题，其实是形状不对，所以提前拦一道。
const ROLE_ARN_PATTERN = /^acs:ram::\d+:role\/[^/]+$/

/**
 * 一类直传目标（图片 / 视频）。两者的差异只有下面这几项，签发逻辑共用同一份实现。
 */
interface UploadKind {
  /// 对象名中间那段目录名，形如 uploads/images/2026/10/<uuid>.jpg
  dir: string
  /// 白名单 MIME，不在里面的直接 400
  mimeTypes: readonly string[]
  /// MIME → 扩展名；扩展名由服务端推导，不信任客户端文件名
  mimeExt: Record<string, string>
  /// 合法的 key 形状，续签复用 key 时按它校验
  keyPattern: RegExp
  /// 报错文案里的中文名
  label: string
  /// 未配置 OSS / 角色时抛给前端的错误码
  disabledCode: string
  /// AssumeRole 的会话名，会出现在 OSS 审计日志里
  sessionName: string
}

const IMAGE_KIND: UploadKind = {
  dir: 'images',
  mimeTypes: IMAGE_MIME_TYPES,
  mimeExt: IMAGE_MIME_EXT,
  keyPattern: IMAGE_KEY_PATTERN,
  label: '图片',
  disabledCode: ErrorCodes.IMAGE_UPLOAD_DISABLED,
  sessionName: 'devshare-image-upload',
}

const VIDEO_KIND: UploadKind = {
  dir: 'videos',
  mimeTypes: VIDEO_MIME_TYPES,
  mimeExt: VIDEO_MIME_EXT,
  keyPattern: VIDEO_KEY_PATTERN,
  label: '视频',
  disabledCode: ErrorCodes.VIDEO_UPLOAD_DISABLED,
  sessionName: 'devshare-video-upload',
}

/// 直传 OSS 需要的全部配置项
interface OssOptions {
  region: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  publicUrl: string
}

// @Injectable() 表示这个类交给 Nest 的依赖注入容器管理，可以被注入到别处
@Injectable()
export class UploadsService {
  // Logger 是 Nest 内置日志工具，输出会自动带上时间与上下文（这里是 UploadsService）
  private readonly logger = new Logger(UploadsService.name)

  // 注入 ConfigService 后，就能用 this.config.get('XXX') 读取配置了
  constructor(private readonly config: ConfigService) {}

  /**
   * 图片上传配置。登录用户都能读：写文章、换头像都要传图，不能像视频那样限管理员。
   * OSS 未配置时 enabled=false，前端据此把上传入口置灰——图片不再有本地磁盘兜底。
   */
  imageConfig(): ImageUploadConfig {
    return {
      enabled: this.uploadEnabled(),
      maxBytes: this.maxImageBytes(),
      // 复制一份，避免调用方拿到共享常量后改坏它
      accept: IMAGE_MIME_TYPES.slice(),
    }
  }

  /// 视频上传配置：仅管理员可读
  videoConfig(user: AuthenticatedUser): VideoUploadConfig {
    this.assertAdmin(user, '仅管理员可上传课程视频')
    return {
      enabled: this.uploadEnabled(),
      maxBytes: this.maxVideoBytes(),
      accept: VIDEO_MIME_TYPES.slice(),
    }
  }

  /// 签发图片直传凭证。登录即可（头像 / 封面 / 正文插图都要传图），
  /// 但凭证被会话策略钉死在单个对象名上，泄漏的爆炸半径只有一个对象。
  async createImageUploadSts(mimetype: string, reuseKey?: string): Promise<OssUploadSts> {
    return this.createUploadSts(IMAGE_KIND, mimetype, reuseKey)
  }

  /// 签发视频直传凭证：仅管理员
  async createVideoUploadSts(
    user: AuthenticatedUser,
    mimetype: string,
    reuseKey?: string,
  ): Promise<OssUploadSts> {
    this.assertAdmin(user, '仅管理员可上传课程视频')
    return this.createUploadSts(VIDEO_KIND, mimetype, reuseKey)
  }

  /**
   * 签发浏览器用 ali-oss SDK 直传 OSS 的 STS 临时凭证。
   * 长期 AccessKey 留在服务端；下发的是限定到**单个对象名**的临时凭证：
   * 会话策略里只允许对这个 key 做上传相关操作，所以凭证泄漏的爆炸半径也就是这一个对象。
   * 拿到凭证后浏览器用 SDK 上传，有进度、失败可重试，文件体同样不经过 Node 与 nginx。
   */
  private async createUploadSts(
    kind: UploadKind,
    mimetype: string,
    reuseKey?: string,
  ): Promise<OssUploadSts> {
    const oss = this.ossOptions()
    const roleArn = this.config.get<string>('OSS_STS_ROLE_ARN')
    if (!oss || !roleArn) {
      throw new ServiceUnavailableException({
        code: kind.disabledCode,
        message: `${kind.label}上传需要先配置 OSS 与 STS 角色`,
      })
    }

    // 形状不对就不必去调 AssumeRole 了，直接把「该填什么」写进日志与响应
    if (!ROLE_ARN_PATTERN.test(roleArn)) {
      this.logger.error(
        `OSS_STS_ROLE_ARN 形状不对：${roleArn}；应为 acs:ram::<账号ID>:role/<角色名>` +
          (roleArn.includes(':user/') ? '（当前填的是 RAM 用户的 ARN，不是角色）' : ''),
      )
      throw new ServiceUnavailableException({
        code: kind.disabledCode,
        message:
          'OSS_STS_ROLE_ARN 必须是角色 ARN（acs:ram::<账号ID>:role/<角色名>），不能填 RAM 用户的 ARN',
      })
    }

    // 扩展名由服务端按 MIME 推导：不信任客户端文件名，避免路径穿越写进 key
    const ext = kind.mimeExt[mimetype]
    if (!ext) {
      throw new BadRequestException({
        code: ErrorCodes.UNSUPPORTED_FILE_TYPE,
        message: `仅支持 ${kind.mimeTypes.join(' / ')}`,
      })
    }

    const key = this.resolveKey(kind, ext, reuseKey)

    // 会话策略（RAM Policy）：只放行这一个对象的写入与分片管理操作。
    // 注意 RAM 策略没法限制单个对象的大小，体积上限靠前端的 config.maxBytes 把关。
    const policy = {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:ListParts'],
          Resource: ['acs:oss:*:*:' + oss.bucket + '/' + key],
        },
      ],
    }

    try {
      const sts = new OSS.STS({
        accessKeyId: oss.accessKeyId,
        accessKeySecret: oss.accessKeySecret,
      })
      const { credentials } = await sts.assumeRole(
        roleArn,
        policy,
        this.stsDurationSeconds(),
        kind.sessionName,
      )
      return {
        region: oss.region,
        bucket: oss.bucket,
        key,
        accessKeyId: credentials.AccessKeyId,
        accessKeySecret: credentials.AccessKeySecret,
        securityToken: credentials.SecurityToken,
        expiration: credentials.Expiration,
        publicUrl: oss.publicUrl,
      }
    } catch (err) {
      // 常见原因：角色 ARN 写错 / 角色 MaxSessionDuration 小于配置的有效期 /
      // 这个 AccessKey 没有 AssumeRole 权限。细节只写服务端日志（可能含账号信息）。
      this.logger.error(`assume role failed (${kind.sessionName}): ` + (err as Error).message)
      throw new ServiceUnavailableException({
        code: kind.disabledCode,
        message: 'STS 临时凭证签发失败，请检查 OSS_STS_ROLE_ARN 与角色授权',
      })
    }
  }

  /// STS 有效期（秒）：默认 3600，可用 OSS_STS_DURATION_SECONDS 调整，配小于下限会被抬到 900
  private stsDurationSeconds(): number {
    const configured = Number(
      this.config.get<string>('OSS_STS_DURATION_SECONDS') ?? DEFAULT_STS_DURATION_SECONDS,
    )
    if (!Number.isFinite(configured)) return DEFAULT_STS_DURATION_SECONDS
    return Math.max(MIN_STS_DURATION_SECONDS, Math.floor(configured))
  }

  /**
   * 对象名：首次由服务端生成；浏览器续签凭证时会带着第一次的 key 回来，复用它即可，
   * 否则续签后的会话策略会钉到另一个对象上，后续上传的签名立刻失效。
   * 只接受本服务端生成过的形状（年/月/UUID + 与该 MIME 匹配的扩展名），挡住任意路径写入。
   */
  private resolveKey(kind: UploadKind, ext: string, reuseKey?: string): string {
    if (reuseKey) {
      if (!kind.keyPattern.test(reuseKey) || !reuseKey.endsWith(ext)) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: `${kind.label}对象名不合法`,
        })
      }
      return reuseKey
    }

    const date = new Date()
    return (
      `uploads/${kind.dir}/` +
      date.getUTCFullYear() +
      '/' +
      String(date.getUTCMonth() + 1).padStart(2, '0') +
      '/' +
      randomUUID() +
      ext
    )
  }

  /// 视频体积上限：默认 4GB，可用 MAX_VIDEO_SIZE_MB 调整（直传 OSS，不受 nginx 体积限制）
  private maxVideoBytes(): number {
    const maxMb = Number(this.config.get<string>('MAX_VIDEO_SIZE_MB') ?? 4096)
    return maxMb * 1024 * 1024
  }

  /// 图片体积上限：默认 20MB，可用 MAX_IMAGE_SIZE_MB 调整。图片传的是原图（不再服务端转码），
  /// 比旧链路的 5MB 放宽，但仍要挡一下动辄几十 MB 的原图。
  private maxImageBytes(): number {
    const maxMb = Number(this.config.get<string>('MAX_IMAGE_SIZE_MB') ?? 20)
    return maxMb * 1024 * 1024
  }

  /// 直传要 OSS 五项 + 一个能 AssumeRole 的角色 ARN：缺任何一项都视为「未启用」，
  /// 前端据此把上传入口置灰（图片与视频都不再有本地磁盘兜底）
  private uploadEnabled(): boolean {
    return this.ossOptions() !== null && Boolean(this.config.get<string>('OSS_STS_ROLE_ARN'))
  }

  /// OSS 配置齐全（含密钥）才允许直传；缺任何一项都视为未启用
  private ossOptions(): OssOptions | null {
    const region = this.config.get<string>('OSS_REGION')
    const bucket = this.config.get<string>('OSS_BUCKET')
    const accessKeyId = this.config.get<string>('OSS_ACCESS_KEY_ID')
    const accessKeySecret = this.config.get<string>('OSS_ACCESS_KEY_SECRET')
    const publicUrl = this.config.get<string>('OSS_PUBLIC_URL')
    if (!region || !bucket || !accessKeyId || !accessKeySecret || !publicUrl) return null
    return { region, bucket, accessKeyId, accessKeySecret, publicUrl }
  }

  private assertAdmin(user: AuthenticatedUser, message: string): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message })
    }
  }
}
