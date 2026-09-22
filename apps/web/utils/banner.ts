// 首页 Banner 跳转地址解析：外链走 <a target="_blank">，站内路径交给 localePath 补语言前缀。

export interface BannerLink {
  external: boolean
  href: string
}

export function isExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link.trim())
}

/// 站内路径统一补前导 `/`（避免管理员少打斜杠时跳到相对路径），外链原样返回
export function resolveBannerLink(link: string): BannerLink {
  const value = link.trim()
  if (isExternalLink(value)) return { external: true, href: value }
  return { external: false, href: value.startsWith('/') ? value : `/${value}` }
}
