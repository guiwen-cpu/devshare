import { describe, expect, it } from 'vitest'
import { toProxyUrl } from './image'

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

  it('OSS 域名在开发环境返回代理 URL', () => {
    expect(
      toProxyUrl(
        'https://devshare-assets.oss-cn-guangzhou.aliyuncs.com/foo/bar',
        import.meta.env.DEV,
      ),
    ).toBe('/oss-assets/foo/bar')
  })
})
