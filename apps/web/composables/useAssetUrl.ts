import { isWebpProcessEnabled, ossImageUrl, rewriteOssImageUrls } from '~/utils/image'

/**
 * 图片地址统一出口：把 OSS 上的图改写成「读取时由 OSS 图片处理（IMG）输出 WebP」。
 *
 * 开关来自 runtimeConfig.public.ossImageWebp（环境变量 NUXT_PUBLIC_OSS_IMAGE_WEBP），
 * 默认开启；bucket 没开通图片处理、或换了不认识这个参数的存储时，把它置成 off 即可
 * 全站回退原图，不用改代码也不用刷数据。
 */
export function useAssetUrl() {
  const config = useRuntimeConfig()
  const enabled = isWebpProcessEnabled(config.public.ossImageWebp)

  return {
    /// 用于 <img :src>：空值返回空串，非 OSS 地址原样返回
    assetUrl: (url: string | null | undefined) => ossImageUrl(url, enabled),
    /// 用于文章正文：只改写 contentHtml 里的 <img src>
    assetHtml: (html: string) => rewriteOssImageUrls(html, enabled),
  }
}
