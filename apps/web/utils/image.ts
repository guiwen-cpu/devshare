import { OSS_IMAGE_WEBP_PROCESS } from '@devshare/shared'

/// 图片与视频的 CDN 加速域名（回源到 OSS bucket）。换域名要改两处：
/// 这里是展示侧，后端签发上传地址用的是 OSS_PUBLIC_URL（apps/api/.env）。
const CDN_HOST = 'https://cdn.devshare.bond'
/// 历史数据存的是 OSS 直连域名，展示时统一换成 CDN 域名——CDN 回源的就是同一个
/// bucket、对象名不变，所以不用刷库，老文章 / 老课程也能走加速。
const LEGACY_OSS_HOST = 'https://devshare-assets.oss-cn-guangzhou.aliyuncs.com'
const PROXY_PREFIX = '/oss-assets'

/// 把老数据里的 OSS 直连地址换成 CDN 域名；不是这个域名的地址原样返回
export function toCdnUrl(url: string): string {
  if (!url.startsWith(LEGACY_OSS_HOST + '/')) return url
  return CDN_HOST + url.slice(LEGACY_OSS_HOST.length)
}

export function toProxyUrl(url: string, dev: boolean = true): string {
  if (typeof url !== 'string') return ''
  // 开发环境走同源代理，生产环境按需处理（见下文）
  if (dev && url.startsWith(CDN_HOST)) {
    return url.replace(CDN_HOST, PROXY_PREFIX)
  }
  return url
}

/// OSS 图片处理（IMG）的参数名：地址里已经带了它，就说明改写过了
const PROCESS_PARAM = 'x-oss-process'

/// 这些后缀不做 WebP 转换：
///   .webp —— 本来就是 WebP，再转一次纯属白花 IMG 的钱
///   .gif  —— IMG 的 format,webp 会把动图压成静帧
///   .svg  —— 矢量图，IMG 处理不了
const SKIP_EXTENSIONS = ['.webp', '.gif', '.svg']

/**
 * 判断「读取时转 WebP」是否开启。
 * 值来自 runtimeConfig.public.ossImageWebp（环境变量是字符串），默认开启，
 * 写成 off / false / 0 / no 时关闭——bucket 没开通图片处理时靠它一键回退原图。
 */
export function isWebpProcessEnabled(value: unknown): boolean {
  if (value === false || value === 0) return false
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  return !['off', 'false', '0', 'no'].includes(normalized)
}

/**
 * 把 OSS 上的图片地址改写成「读取时由 OSS 图片处理（IMG）输出 WebP」。
 *
 * 上传的是原图、库里存的也是原图地址，只有展示时才追这个参数，因此：
 *   - 老数据（jpg/png/gif）不用迁移就能吃到 WebP；
 *   - 老数据里的 OSS 直连地址在这里顺手换成 CDN 域名（见 toCdnUrl）；
 *   - 关掉 IMG 只需要改前端开关，不用动数据库。
 * 非 OSS 地址（外链图床、本地静态图）、已在用的 WebP、动图与矢量图都原样返回。
 */
export function ossImageUrl(url: string | null | undefined, enabled: boolean = true): string {
  if (typeof url !== 'string' || url === '') return ''
  // 换域名与转 WebP 是两件事：开关关掉时也要把老地址换成 CDN
  const cdnUrl = toCdnUrl(url)
  if (!enabled) return cdnUrl
  // 只改写上传到 OSS 的图；外链图床不认这个参数，硬加会让图片 404
  if (!cdnUrl.includes('/uploads/')) return cdnUrl
  if (cdnUrl.includes(PROCESS_PARAM)) return cdnUrl

  // 先剥掉查询串再判断后缀，形如 .../a.png?v=1 也要能认出来
  const pathname = (cdnUrl.split('?')[0] ?? '').toLowerCase()
  if (SKIP_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return cdnUrl

  const separator = cdnUrl.includes('?') ? '&' : '?'
  return cdnUrl + separator + PROCESS_PARAM + '=' + OSS_IMAGE_WEBP_PROCESS
}

/**
 * 文章正文是后端 markdown-it 渲染 + xss 白名单清洗过的 HTML，
 * 这里只把其中的 <img src="..."> 换成带 x-oss-process 的地址。
 * 正则只匹配 <img> 的 src 属性，同页面里的 <video src> 不受影响。
 */
export function rewriteOssImageUrls(html: string, enabled: boolean = true): string {
  if (typeof html !== 'string' || html === '' || !enabled)
    return typeof html === 'string' ? html : ''
  return html.replace(
    /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi,
    (_match: string, head: string, src: string, tail: string) =>
      head + ossImageUrl(src, enabled) + tail,
  )
}
