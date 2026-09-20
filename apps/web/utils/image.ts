const OSS_HOST = 'https://devshare-assets.oss-cn-guangzhou.aliyuncs.com'
const PROXY_PREFIX = '/oss-assets'

export function toProxyUrl(url: string, dev: boolean = true): string {
  if (typeof url !== 'string') return ''
  // 开发环境走同源代理，生产环境按需处理（见下文）
  if (dev && url.startsWith(OSS_HOST)) {
    return url.replace(OSS_HOST, PROXY_PREFIX)
  }
  return url
}
