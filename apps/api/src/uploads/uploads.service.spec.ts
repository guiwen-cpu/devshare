// ============================================================================
// uploads.service.spec.ts —— UploadsService 的单元测试
//
// 测试思路：不启动 HTTP 服务，直接把 Service new 出来、喂给它一个假文件，
// 然后断言「结果对不对」和「磁盘/OSS 上确实发生了什么」。
// 跑测试：pnpm --filter @devshare/api test
// ============================================================================
import { BadRequestException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { UploadsService } from './uploads.service'

// 事先准备好一个假的 put 函数，用来替换 ali-oss 的 client.put
const mockPut = jest.fn()
// jest.mock 会把整个模块替换掉：
// 默认导出（OSS 构造函数）返回一个带 put 的假客户端，这样测试就不会真的发网络请求
jest.mock('ali-oss', () => ({
  __esModule: true,
  default: jest.fn(() => ({ put: mockPut })),
}))

/** 构造一个假的 ConfigService：不用真读 .env，想返回什么就返回什么 */
function createService(config: Record<string, string | undefined>) {
  const fake = {
    get: (key: string) => config[key],
  } as unknown as ConfigService
  return new UploadsService(fake)
}

/** 构造 multer 文件对象的简化版，只填测试关心的字段 */
function mockFile(
  buffer: Buffer,
  mimetype: string,
  originalname = 'test.png',
): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
  } as Express.Multer.File
}

/**
 * 手搓一个最小的两帧 GIF（1x1 像素，红、蓝各一帧，每帧 0.5 秒）。
 * 为什么不用 sharp 生成：实测用「一组图片」让 sharp 写出来的 GIF 并不算动图
 * （读回来 pages 还是 1），所以这里直接按 GIF89a 规范拼字节，保证测试用的是真动图。
 */
function buildAnimatedGif(): Buffer {
  const globalColorTable = Buffer.from([255, 0, 0, 0, 0, 255]) // 调色板：0=红，1=蓝
  const frame = (colorIndex: 0 | 1, delayCentiseconds: number) =>
    Buffer.from([
      // 图形控制扩展：帧间隔
      0x21,
      0xf9,
      0x04,
      0x00,
      delayCentiseconds & 0xff,
      delayCentiseconds >> 8,
      0x00,
      0x00,
      // 图像描述符：从 (0,0) 开始的 1x1 区域
      0x2c,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0x00,
      // LZW 数据：0x44 表示颜色索引 0，0x4c 表示索引 1
      0x02,
      0x02,
      colorIndex === 0 ? 0x44 : 0x4c,
      0x01,
      0x00,
    ])

  return Buffer.concat([
    Buffer.from('GIF89a'),
    Buffer.from([1, 0, 1, 0, 0x80, 0, 0]), // 逻辑屏幕描述符：1x1，带全局调色板
    globalColorTable,
    frame(0, 50), // 红
    frame(1, 50), // 蓝
    Buffer.from([0x3b]), // 文件结束符
  ])
}

describe('UploadsService', () => {
  // 用随机目录名，避免和别人的测试、真实上传目录互相干扰
  const uploadDir = `uploads-test/${randomUUID()}`
  const publicUrl = 'http://localhost:3000'
  const service = createService({ UPLOAD_DIR: uploadDir, PUBLIC_API_URL: publicUrl })

  // 提前生成一张 100x50 的纯色 PNG，后面几个用例复用
  let png: Buffer
  beforeAll(async () => {
    png = await sharp({
      create: { width: 100, height: 50, channels: 3, background: '#3366ff' },
    })
      .png()
      .toBuffer()
  })

  afterAll(async () => {
    // 清掉测试产生的临时目录，别把垃圾留在仓库里
    await rm(join(process.cwd(), 'uploads-test'), { recursive: true, force: true })
  })

  it('把 PNG 转成 WebP 存到本地，并返回可访问 URL', async () => {
    const result = await service.saveImage(mockFile(png, 'image/png'))

    expect(result.mode).toBe('local')
    // URL 形如 http://localhost:3000/uploads/2026/09/<uuid>.webp
    expect(result.url).toMatch(
      /^http:\/\/localhost:3000\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/,
    )

    // 再到磁盘上确认：文件真的存在，而且格式确实是 webp（不是把 .png 改了个名字）
    const relative = result.url.split('/uploads/')[1]
    const saved = await readFile(join(process.cwd(), uploadDir, relative))
    const meta = await sharp(saved).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(100)
    expect(meta.height).toBe(50)
    // WebP 一般比原 PNG 小，这条断言顺带证明「压缩生效了」
    expect(saved.length).toBeLessThan(png.length)
  })

  it('动图（GIF）上传后仍然得到一个合法的 webp', async () => {
    const gif = buildAnimatedGif()

    const result = await service.saveImage(mockFile(gif, 'image/gif', 'a.gif'))
    const relative = result.url.split('/uploads/')[1]
    const saved = await readFile(join(process.cwd(), uploadDir, relative))
    const meta = await sharp(saved, { animated: true }).metadata()

    expect(meta.format).toBe('webp')
    // 这里只断言「转换成功、格式正确」。至于转出来的 webp 是否保留了全部帧和播放效果，
    // 取决于 libvips 编译时有没有带 WebP 动图支持，各平台可能不一致，
    // 所以不写死在单元测试里。要确认动图效果，请拿一张真实 GIF 手动上传验证一次。
  })

  it('配了 OSS 配置时上传到 OSS，且上传的是 webp', async () => {
    mockPut.mockClear() // 清掉别的用例可能留下的调用记录

    const ossService = createService({
      OSS_REGION: 'oss-cn-hangzhou',
      OSS_BUCKET: 'my-bucket',
      OSS_ACCESS_KEY_ID: 'id',
      OSS_ACCESS_KEY_SECRET: 'secret',
      OSS_PUBLIC_URL: 'https://cdn.example.com',
    })

    const result = await ossService.saveImage(mockFile(png, 'image/png'))

    expect(result.mode).toBe('oss')
    expect(result.url).toMatch(
      /^https:\/\/cdn\.example\.com\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/,
    )
    // 校验 SDK 被这样调用：put(key, buffer, options)
    const [key, body, options] = mockPut.mock.calls[0]
    expect(key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/)
    expect(options.headers['Content-Type']).toBe('image/webp')
    expect((await sharp(body).metadata()).format).toBe('webp')
  })

  it('非图片类型直接拒绝', async () => {
    await expect(
      service.saveImage(mockFile(Buffer.from('hello'), 'text/plain', 'a.txt')),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('超过大小上限直接拒绝', async () => {
    const file = mockFile(png, 'image/png')
    file.size = 6 * 1024 * 1024 // 伪造一个 6MB 的文件（默认上限 5MB）
    await expect(service.saveImage(file)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('伪装成图片的坏文件会被拦下（sharp 解析失败）', async () => {
    await expect(
      service.saveImage(mockFile(Buffer.from('not an image'), 'image/png', 'fake.png')),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
