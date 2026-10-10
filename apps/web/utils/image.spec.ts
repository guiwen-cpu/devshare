import { describe, expect, it } from 'vitest'
import {
  isWebpProcessEnabled,
  ossImageUrl,
  rewriteOssImageUrls,
  toCdnUrl,
  toProxyUrl,
} from './image'

// CDN = 展示用的加速域名（库里新数据存的也是它）；OSS = 老数据里存的直连域名
const CDN = 'https://cdn.devshare.bond'
const OSS = 'https://devshare-assets.oss-cn-guangzhou.aliyuncs.com'
const WEBP = 'x-oss-process=image/format,webp'

describe('toProxyUrl', () => {
  it('传入非字符串返回空字符串', () => {
    expect(toProxyUrl(null as unknown as string, import.meta.env.DEV)).toBe('')
    expect(toProxyUrl(undefined as unknown as string, import.meta.env.DEV)).toBe('')
    expect(toProxyUrl(123 as unknown as string, import.meta.env.DEV)).toBe('')
  })
  it('域名不对原样返回', () => {
    expect(toProxyUrl('https://example.com/foo/bar', import.meta.env.DEV)).toBe(
      'https://example.com/foo/bar',
    )
  })

  it('CDN 域名在开发环境返回代理 URL', () => {
    expect(toProxyUrl(CDN + '/foo/bar', import.meta.env.DEV)).toBe('/oss-assets/foo/bar')
  })
})

describe('toCdnUrl', () => {
  it('把老数据里的 OSS 直连地址换成 CDN 域名，查询串原样保留', () => {
    expect(toCdnUrl(OSS + '/uploads/images/2026/09/a.png')).toBe(
      CDN + '/uploads/images/2026/09/a.png',
    )
    expect(toCdnUrl(OSS + '/uploads/2026/09/a.png?v=1')).toBe(CDN + '/uploads/2026/09/a.png?v=1')
  })

  it('已经是 CDN 域名或其它域名原样返回', () => {
    expect(toCdnUrl(CDN + '/uploads/2026/09/a.png')).toBe(CDN + '/uploads/2026/09/a.png')
    expect(toCdnUrl('https://images.example.com/photo.jpg')).toBe(
      'https://images.example.com/photo.jpg',
    )
    // 只是同前缀的另一个域名（少个 /）不能误伤
    expect(toCdnUrl(OSS + '.evil.com/uploads/a.png')).toBe(OSS + '.evil.com/uploads/a.png')
  })
})

describe('isWebpProcessEnabled', () => {
  it('默认开启，off / false / 0 / no 关闭', () => {
    expect(isWebpProcessEnabled(undefined)).toBe(true)
    expect(isWebpProcessEnabled('')).toBe(true)
    expect(isWebpProcessEnabled('on')).toBe(true)
    expect(isWebpProcessEnabled('OFF')).toBe(false)
    expect(isWebpProcessEnabled('false')).toBe(false)
    expect(isWebpProcessEnabled('0')).toBe(false)
    expect(isWebpProcessEnabled('no')).toBe(false)
    expect(isWebpProcessEnabled(false)).toBe(false)
  })
})

describe('ossImageUrl', () => {
  it('空值与非字符串返回空字符串', () => {
    expect(ossImageUrl(null)).toBe('')
    expect(ossImageUrl(undefined)).toBe('')
    expect(ossImageUrl(123 as unknown as string)).toBe('')
  })

  it('关掉开关时不追 WebP 参数，但仍旧把老地址换成 CDN', () => {
    expect(ossImageUrl(CDN + '/uploads/images/2026/10/a.jpg', false)).toBe(
      CDN + '/uploads/images/2026/10/a.jpg',
    )
    expect(ossImageUrl(OSS + '/uploads/images/2026/10/a.jpg', false)).toBe(
      CDN + '/uploads/images/2026/10/a.jpg',
    )
  })

  it('非 OSS 地址（外链图床 / 本地静态图）原样返回', () => {
    expect(ossImageUrl('https://images.example.com/photo.jpg')).toBe(
      'https://images.example.com/photo.jpg',
    )
    expect(ossImageUrl('/logo.svg')).toBe('/logo.svg')
    expect(ossImageUrl('http://localhost:3000/uploads/2026/09/a.webp')).toBe(
      'http://localhost:3000/uploads/2026/09/a.webp',
    )
  })

  it('OSS 上的位图换 CDN 域名后追加上 WebP 参数', () => {
    expect(ossImageUrl(CDN + '/uploads/images/2026/10/a.jpg')).toBe(
      CDN + '/uploads/images/2026/10/a.jpg?' + WEBP,
    )
    // 老数据里的 OSS 直连地址与 uploads/年/月 形式同样命中
    expect(ossImageUrl(OSS + '/uploads/2026/09/a.png')).toBe(CDN + '/uploads/2026/09/a.png?' + WEBP)
  })

  it('已有查询串时用 & 追加', () => {
    expect(ossImageUrl(CDN + '/uploads/2026/09/a.png?v=2')).toBe(
      CDN + '/uploads/2026/09/a.png?v=2&' + WEBP,
    )
  })

  it('已经带过参数就不重复追加', () => {
    const done = CDN + '/uploads/2026/09/a.png?' + WEBP
    expect(ossImageUrl(done)).toBe(done)
  })

  it('webp / gif / svg 不改写', () => {
    expect(ossImageUrl(CDN + '/uploads/2026/09/a.webp')).toBe(CDN + '/uploads/2026/09/a.webp')
    expect(ossImageUrl(CDN + '/uploads/2026/09/a.gif')).toBe(CDN + '/uploads/2026/09/a.gif')
    expect(ossImageUrl(CDN + '/uploads/2026/09/a.svg')).toBe(CDN + '/uploads/2026/09/a.svg')
    // 后缀判断要忽略大小写与前后的查询串
    expect(ossImageUrl(CDN + '/uploads/2026/09/a.GIF?x=1')).toBe(CDN + '/uploads/2026/09/a.GIF?x=1')
  })
})

describe('rewriteOssImageUrls', () => {
  it('改写正文里的 <img>（换成 CDN 并追 WebP），且不动 <video> 的 src', () => {
    const html =
      '<p>看图</p><img src="' +
      OSS +
      '/uploads/2026/09/a.png" alt="x"><video src="' +
      OSS +
      '/uploads/videos/2026/09/v.mp4"></video>'

    const out = rewriteOssImageUrls(html)

    expect(out).toContain('src="' + CDN + '/uploads/2026/09/a.png?' + WEBP + '"')
    expect(out).toContain('src="' + OSS + '/uploads/videos/2026/09/v.mp4"')
  })

  it('多张图一次改完，外链与非图片地址保持原样', () => {
    const html =
      '<img src="' +
      CDN +
      '/uploads/2026/09/a.jpg"><img src="https://cdn.example.com/b.png"><img src="' +
      CDN +
      '/uploads/2026/09/c.webp">'

    const out = rewriteOssImageUrls(html)

    expect(out).toBe(
      '<img src="' +
        CDN +
        '/uploads/2026/09/a.jpg?' +
        WEBP +
        '"><img src="https://cdn.example.com/b.png"><img src="' +
        CDN +
        '/uploads/2026/09/c.webp">',
    )
  })

  it('开关关闭或内容为空时原样返回', () => {
    const html = '<img src="' + CDN + '/uploads/2026/09/a.jpg">'
    expect(rewriteOssImageUrls(html, false)).toBe(html)
    expect(rewriteOssImageUrls('')).toBe('')
    expect(rewriteOssImageUrls(null as unknown as string)).toBe('')
  })
})
