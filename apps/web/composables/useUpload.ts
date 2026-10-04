import {
  UPLOAD_CACHE_CONTROL,
  type ImageUploadConfig,
  type OssUploadSts,
  type VideoUploadConfig,
} from '@devshare/shared'
import { useApi } from '~/composables/useApi'
import { isAllowedVideoMime } from '~/utils/video'

export function useUpload() {
  const api = useApi()
  const i18n = useI18n()
  const toast = useToast()

  /// 图片上传配置（登录即可读）：是否启用 / 体积上限 / 允许格式
  function fetchImageConfig(): Promise<ImageUploadConfig> {
    return api.get<ImageUploadConfig>('/uploads/image/config')
  }

  /// 视频上传配置（是否启用 / 体积上限 / 允许格式），仅管理员可读
  function fetchVideoConfig(): Promise<VideoUploadConfig> {
    return api.get<VideoUploadConfig>('/uploads/video/config')
  }

  /**
   * 浏览器直传 OSS：用 ali-oss SDK + 后端签发的 STS 临时凭证上传，
   * 文件体不经过 Node 与 nginx，所以上限只取决于 OSS 策略，不受 nginx client_max_body_size
   * 与 multer 内存缓冲限制；SDK 还会给出进度、失败重试，并在凭证快过期时自动续签。
   * 图片与视频走的是同一段逻辑，只有签凭证的接口不同。
   */
  async function putToOss(
    stsEndpoint: string,
    sts: OssUploadSts,
    mimetype: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    // SDK 体积不小（min 版 gzip 后仍有 170KB+），只有真的上传时才用得上，
    // 动态 import 让它单独成 chunk，不进首屏
    const { default: OSS } = await import('ali-oss')

    const client = new OSS({
      region: sts.region,
      bucket: sts.bucket,
      accessKeyId: sts.accessKeyId,
      accessKeySecret: sts.accessKeySecret,
      stsToken: sts.securityToken,
      // secure 默认是 false（SDK 会走 http），HTTPS 站点上会被浏览器当成混合内容拦掉，显式打开
      secure: true,
      // 凭证过期前 SDK 会自动调这里续签。必须带上第一次签发的 key：后端的会话策略只放行
      // 这一个对象，换成新 key 的话策略会指向别的对象，正在上传的分片会立刻签名失败。
      refreshSTSToken: async () => {
        const next = await api.post<OssUploadSts>(stsEndpoint, {
          mimetype,
          key: sts.key,
        })
        return {
          accessKeyId: next.accessKeyId,
          accessKeySecret: next.accessKeySecret,
          stsToken: next.securityToken,
        }
      },
      refreshSTSTokenInterval: 300_000,
    })

    // multipartUpload：分片并行上传，progress 回调参数是 0~1 的完成比例（收尾时补 1）。
    // 小于 100KB 的文件 SDK 会直接走一次 put，图片基本都落在这一档。
    await client.multipartUpload(sts.key, file, {
      // Content-Type 由 SDK 从 mime 推导；缓存头只能通过 headers 带（对象元数据在请求里写入）
      mime: mimetype,
      headers: { 'Cache-Control': UPLOAD_CACHE_CONTROL },
      progress: (percent: number) => {
        if (onProgress) onProgress(Math.round(percent * 100))
      },
    })

    if (onProgress) onProgress(100)
    return sts.publicUrl + '/' + sts.key
  }

  /**
   * 上传图片：原图直传 OSS，服务端不再转码。
   * 展示时由 OSS 图片处理（IMG）按需输出 WebP，见 composables/useAssetUrl.ts。
   * 返回的地址可以直接放进 <img :src>。
   */
  async function uploadImage(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const config = await fetchImageConfig()
    if (!config.enabled) {
      toast.error(i18n.t('errors.IMAGE_UPLOAD_DISABLED'))
      throw new Error('IMAGE_UPLOAD_DISABLED')
    }
    if (!config.accept.includes(file.type)) {
      toast.error(i18n.t('errors.UNSUPPORTED_FILE_TYPE'))
      throw new Error('UNSUPPORTED_FILE_TYPE')
    }
    if (file.size > config.maxBytes) {
      toast.error(i18n.t('errors.UPLOAD_TOO_LARGE'))
      throw new Error('UPLOAD_TOO_LARGE')
    }

    const sts = await api.post<OssUploadSts>('/uploads/image/sts', { mimetype: file.type })

    try {
      return await putToOss('/uploads/image/sts', sts, file.type, file, onProgress)
    } catch (error) {
      toast.error(i18n.t('common.error'))
      throw error
    }
  }

  async function uploadImages(files: File[]): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
      urls.push(await uploadImage(file))
    }
    return urls
  }

  async function uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<string> {
    const config = await fetchVideoConfig()
    if (!config.enabled) {
      toast.error(i18n.t('errors.VIDEO_UPLOAD_DISABLED'))
      throw new Error('VIDEO_UPLOAD_DISABLED')
    }
    if (!isAllowedVideoMime(file.type, config.accept)) {
      toast.error(i18n.t('errors.UNSUPPORTED_FILE_TYPE'))
      throw new Error('UNSUPPORTED_FILE_TYPE')
    }
    if (file.size > config.maxBytes) {
      toast.error(i18n.t('errors.UPLOAD_TOO_LARGE'))
      throw new Error('UPLOAD_TOO_LARGE')
    }

    const sts = await api.post<OssUploadSts>('/uploads/video/sts', { mimetype: file.type })

    try {
      return await putToOss('/uploads/video/sts', sts, file.type, file, onProgress)
    } catch (error) {
      toast.error(i18n.t('common.error'))
      throw error
    }
  }

  return {
    fetchImageConfig,
    fetchVideoConfig,
    uploadImage,
    uploadImages,
    uploadVideo,
  }
}
