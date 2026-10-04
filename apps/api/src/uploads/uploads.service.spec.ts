// ============================================================================
// uploads.service.spec.ts —— UploadsService 的单元测试
//
// 测试思路：不启动 HTTP 服务，直接把 Service new 出来，断言「签发的凭证对不对」。
// 图片与视频都已改成浏览器直传 OSS，服务端只做「下发配置 + 签发临时凭证」两件事，
// 所以这里全部围绕 AssumeRole 展开，不再有磁盘 / sharp 相关用例。
// 跑测试：pnpm --filter @devshare/api test
// ============================================================================
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  ErrorCodes,
  IMAGE_MIME_TYPES,
  VIDEO_MIME_TYPES,
  type ImageUploadConfig,
} from '@devshare/shared'
import { UploadsService } from './uploads.service'

// 图片与视频的签发都走 OSS.STS.assumeRole（只有 Node 入口才有这个类），这里换成替身
const mockAssumeRole = jest.fn()
jest.mock('ali-oss', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    STS: jest.fn(() => ({ assumeRole: mockAssumeRole })),
  }),
}))

/** 构造一个假的 ConfigService：不用真读 .env，想返回什么就返回什么 */
function createService(config: Record<string, string | undefined>) {
  const fake = {
    get: (key: string) => config[key],
  } as unknown as ConfigService
  return new UploadsService(fake)
}

/// OSS 五项 + 一个可 AssumeRole 的角色 ARN：缺任何一项都视为未启用
const ossConfig: Record<string, string | undefined> = {
  OSS_REGION: 'oss-cn-guangzhou',
  OSS_BUCKET: 'devshare-assets',
  OSS_ACCESS_KEY_ID: 'id',
  OSS_ACCESS_KEY_SECRET: 'secret',
  OSS_PUBLIC_URL: 'https://cdn.example.com',
  OSS_STS_ROLE_ARN: 'acs:ram::123:role/devshare-upload',
}

const admin = { id: 1, email: 'admin@devshare.dev', username: 'admin', role: 'admin' }
const viewer = { id: 2, email: 'user@devshare.dev', username: 'user', role: 'user' }

const DEFAULT_IMAGE_BYTES = 20 * 1024 * 1024 // MAX_IMAGE_SIZE_MB 默认 20
const DEFAULT_VIDEO_BYTES = 4096 * 1024 * 1024 // MAX_VIDEO_SIZE_MB 默认 4096

/// 取出 Nest 异常里响应体的错误码，用来断言「前端到底收到哪个 code」
async function errorCodeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (err) {
    const body = (err as { getResponse?: () => unknown }).getResponse?.()
    return (body as { code?: string } | undefined)?.code ?? ''
  }
  throw new Error('expected the call to reject, but it resolved')
}

describe('UploadsService', () => {
  // 每个用例前把 AssumeRole 的替身恢复成「成功」，返回阿里云那种首字母大写的凭证字段
  beforeEach(() => {
    mockAssumeRole.mockReset()
    mockAssumeRole.mockResolvedValue({
      credentials: {
        AccessKeyId: 'sts-id',
        AccessKeySecret: 'sts-secret',
        SecurityToken: 'sts-token',
        Expiration: '2026-09-27T12:00:00Z',
      },
    })
  })

  describe('上传配置', () => {
    it('未配置 OSS 时图片与视频都显示为未启用', () => {
      const local = createService({})

      expect(local.imageConfig()).toEqual({
        enabled: false,
        maxBytes: DEFAULT_IMAGE_BYTES,
        accept: IMAGE_MIME_TYPES,
      })
      expect(local.videoConfig(admin).enabled).toBe(false)
    })

    it('OSS 五项齐全但没有角色 ARN 时仍然未启用', () => {
      const withoutRole = { ...ossConfig, OSS_STS_ROLE_ARN: undefined }
      const service = createService(withoutRole)

      expect(service.imageConfig().enabled).toBe(false)
      expect(service.videoConfig(admin).enabled).toBe(false)
    })

    it('配齐后图片与视频都启用，默认上限分别是 20MB 与 4GB', () => {
      const oss = createService(ossConfig)

      expect(oss.imageConfig()).toEqual({
        enabled: true,
        maxBytes: DEFAULT_IMAGE_BYTES,
        accept: IMAGE_MIME_TYPES,
      })
      expect(oss.videoConfig(admin)).toEqual({
        enabled: true,
        maxBytes: DEFAULT_VIDEO_BYTES,
        accept: VIDEO_MIME_TYPES,
      })
    })

    it('图片体积上限可用 MAX_IMAGE_SIZE_MB 调整', () => {
      const oss = createService({ ...ossConfig, MAX_IMAGE_SIZE_MB: '8' })

      expect((oss.imageConfig() as ImageUploadConfig).maxBytes).toBe(8 * 1024 * 1024)
    })

    it('图片配置对登录用户开放，视频配置与凭证只给管理员', async () => {
      const oss = createService(ossConfig)

      // 普通用户要能发文章、换头像，图片这条链路不能限管理员
      expect(oss.imageConfig().enabled).toBe(true)
      expect((await oss.createImageUploadSts('image/png')).key).toMatch(/\.png$/)

      expect(() => oss.videoConfig(viewer)).toThrow(ForbiddenException)
      await expect(oss.createVideoUploadSts(viewer, 'video/mp4')).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      // 被拒的两次都不会碰到 AssumeRole（图片那一次是允许的，所以正好 1 次）
      expect(mockAssumeRole).toHaveBeenCalledTimes(1)
    })

    it('accept 是副本，调用方改它不会污染共享常量', () => {
      const oss = createService(ossConfig)
      oss.imageConfig().accept.push('image/svg+xml')

      expect(IMAGE_MIME_TYPES).not.toContain('image/svg+xml')
    })
  })

  describe('图片 STS', () => {
    it('签发 png 的凭证：对象名带年/月/uuid，返回的是临时凭证', async () => {
      const oss = createService(ossConfig)

      const result = await oss.createImageUploadSts('image/png')

      expect(result.region).toBe('oss-cn-guangzhou')
      expect(result.bucket).toBe('devshare-assets')
      // 对象名由服务端生成：uploads/images/年/月/<uuid>.png
      expect(result.key).toMatch(/^uploads\/images\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/)
      expect(result.publicUrl).toBe('https://cdn.example.com')
      expect(result.accessKeyId).toBe('sts-id')
      expect(result.accessKeySecret).toBe('sts-secret')
      expect(result.securityToken).toBe('sts-token')
      expect(result.expiration).toBe('2026-09-27T12:00:00Z')
    })

    it('会话策略只放行这一个对象，换不动路径', async () => {
      const oss = createService(ossConfig)

      const result = await oss.createImageUploadSts('image/jpeg')

      expect(mockAssumeRole).toHaveBeenCalledTimes(1)
      const [roleArn, policy, duration, sessionName] = mockAssumeRole.mock.calls[0]
      expect(roleArn).toBe(ossConfig.OSS_STS_ROLE_ARN)
      expect(duration).toBe(3600)
      expect(sessionName).toBe('devshare-image-upload')
      expect(policy).toEqual({
        Version: '1',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:ListParts'],
            Resource: ['acs:oss:*:*:devshare-assets/' + result.key],
          },
        ],
      })
    })

    it('扩展名由服务端按 MIME 推导，白名单外的格式一律拒绝', async () => {
      const oss = createService(ossConfig)

      expect((await oss.createImageUploadSts('image/jpeg')).key).toMatch(/\.jpg$/)
      expect((await oss.createImageUploadSts('image/webp')).key).toMatch(/\.webp$/)
      expect((await oss.createImageUploadSts('image/gif')).key).toMatch(/\.gif$/)
      expect((await oss.createImageUploadSts('image/avif')).key).toMatch(/\.avif$/)

      // SVG 是可执行脚本的 XML，视频也不是图片：都必须在签发前挡掉
      expect(await errorCodeOf(oss.createImageUploadSts('image/svg+xml'))).toBe(
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
      )
      expect(await errorCodeOf(oss.createImageUploadSts('video/mp4'))).toBe(
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
      )
      await expect(oss.createImageUploadSts('image/tiff')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      // 只有上面 4 次合法签发真的调了 AssumeRole
      expect(mockAssumeRole).toHaveBeenCalledTimes(4)
    })

    it('未配置 OSS / 角色时拒绝签发，错误码指向图片', async () => {
      const local = createService({})

      await expect(local.createImageUploadSts('image/png')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
      expect(await errorCodeOf(local.createImageUploadSts('image/png'))).toBe(
        ErrorCodes.IMAGE_UPLOAD_DISABLED,
      )
      expect(mockAssumeRole).not.toHaveBeenCalled()
    })

    it('OSS_STS_ROLE_ARN 填成 RAM 用户的 ARN 时提前拦下，不去调 AssumeRole', async () => {
      // 踩过的坑：把 RAM 用户的 ARN 当角色 ARN 填，AssumeRole 只回 EntityNotExist.Role
      const oss = createService({
        ...ossConfig,
        OSS_STS_ROLE_ARN: 'acs:ram::123:user/devshare-oss-uploader',
      })

      await expect(oss.createImageUploadSts('image/png')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
      expect(await errorCodeOf(oss.createImageUploadSts('image/png'))).toBe(
        ErrorCodes.IMAGE_UPLOAD_DISABLED,
      )
      expect(mockAssumeRole).not.toHaveBeenCalled()
    })

    it('续签时复用同一个对象名，策略继续钉在同一个 key 上', async () => {
      const oss = createService(ossConfig)

      const first = await oss.createImageUploadSts('image/png')
      mockAssumeRole.mockClear()
      const renewed = await oss.createImageUploadSts('image/png', first.key)

      expect(renewed.key).toBe(first.key)
      const policy = mockAssumeRole.mock.calls[0][1] as {
        Statement: { Resource: string[] }[]
      }
      expect(policy.Statement[0].Resource).toEqual(['acs:oss:*:*:devshare-assets/' + first.key])
    })

    it('非法的复用对象名会被拒绝（防路径穿越 / 扩展名不匹配 / 视频 key）', async () => {
      const oss = createService(ossConfig)

      expect(
        await errorCodeOf(
          oss.createImageUploadSts('image/png', 'uploads/images/2026/09/../../x.png'),
        ),
      ).toBe(ErrorCodes.VALIDATION_FAILED)

      const gifKey = (await oss.createImageUploadSts('image/gif')).key
      await expect(oss.createImageUploadSts('image/png', gifKey)).rejects.toBeInstanceOf(
        BadRequestException,
      )

      // 图片签发不接受视频目录下的 key
      await expect(
        oss.createImageUploadSts('image/png', 'uploads/videos/2026/09/' + 'a'.repeat(36) + '.png'),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('AssumeRole 失败时转成 503，不把 OSS 细节抛给前端', async () => {
      const oss = createService(ossConfig)
      mockAssumeRole.mockRejectedValue(new Error('NoPermission'))

      expect(await errorCodeOf(oss.createImageUploadSts('image/png'))).toBe(
        ErrorCodes.IMAGE_UPLOAD_DISABLED,
      )
    })
  })

  describe('视频 STS', () => {
    it('签发 mp4：会话名与图片区分开，有效期默认 1 小时', async () => {
      const oss = createService(ossConfig)

      const result = await oss.createVideoUploadSts(admin, 'video/mp4')

      expect(result.key).toMatch(/^uploads\/videos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.mp4$/)
      expect(mockAssumeRole.mock.calls[0][2]).toBe(3600)
      expect(mockAssumeRole.mock.calls[0][3]).toBe('devshare-video-upload')
    })

    it('webm 得到 .webm 扩展名，需要转码的格式与图片都直接拒绝', async () => {
      const oss = createService(ossConfig)

      expect((await oss.createVideoUploadSts(admin, 'video/webm')).key).toMatch(/\.webm$/)
      expect(await errorCodeOf(oss.createVideoUploadSts(admin, 'video/quicktime'))).toBe(
        ErrorCodes.UNSUPPORTED_FILE_TYPE,
      )
      await expect(oss.createVideoUploadSts(admin, 'image/png')).rejects.toBeInstanceOf(
        BadRequestException,
      )
      // 被拒的两个格式没有真的去调 AssumeRole
      expect(mockAssumeRole).toHaveBeenCalledTimes(1)
    })

    it('未配置 OSS / 角色时拒绝签发，错误码指向视频', async () => {
      const local = createService({})

      expect(await errorCodeOf(local.createVideoUploadSts(admin, 'video/mp4'))).toBe(
        ErrorCodes.VIDEO_UPLOAD_DISABLED,
      )
    })

    it('有效期可用 OSS_STS_DURATION_SECONDS 调整，配小了会被抬到下限', async () => {
      const custom = createService({ ...ossConfig, OSS_STS_DURATION_SECONDS: '1800' })
      await custom.createVideoUploadSts(admin, 'video/mp4')
      expect(mockAssumeRole.mock.calls[0][2]).toBe(1800)

      // AssumeRole 的下限是 900 秒，配得更小没有意义，直接抬到 900
      mockAssumeRole.mockClear()
      const tooShort = createService({ ...ossConfig, OSS_STS_DURATION_SECONDS: '60' })
      await tooShort.createVideoUploadSts(admin, 'video/mp4')
      expect(mockAssumeRole.mock.calls[0][2]).toBe(900)

      // 配了非数字就回落到默认值，而不是把 NaN 传给 OSS
      mockAssumeRole.mockClear()
      const garbage = createService({ ...ossConfig, OSS_STS_DURATION_SECONDS: 'soon' })
      await garbage.createVideoUploadSts(admin, 'video/mp4')
      expect(mockAssumeRole.mock.calls[0][2]).toBe(3600)
    })

    it('续签时复用同一个对象名', async () => {
      const oss = createService(ossConfig)

      const first = await oss.createVideoUploadSts(admin, 'video/mp4')
      mockAssumeRole.mockClear()
      const renewed = await oss.createVideoUploadSts(admin, 'video/mp4', first.key)

      expect(renewed.key).toBe(first.key)
    })

    it('非法的复用对象名会被拒绝（防路径穿越 / 扩展名不匹配）', async () => {
      const oss = createService(ossConfig)

      await expect(
        oss.createVideoUploadSts(admin, 'video/mp4', 'uploads/videos/2026/09/../../x.mp4'),
      ).rejects.toBeInstanceOf(BadRequestException)

      const webmKey = (await oss.createVideoUploadSts(admin, 'video/webm')).key
      await expect(oss.createVideoUploadSts(admin, 'video/mp4', webmKey)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('可用 MAX_VIDEO_SIZE_MB 调整体积上限', () => {
      const oss = createService({ ...ossConfig, MAX_VIDEO_SIZE_MB: '2048' })

      expect(oss.videoConfig(admin).maxBytes).toBe(2048 * 1024 * 1024)
    })
  })
})
