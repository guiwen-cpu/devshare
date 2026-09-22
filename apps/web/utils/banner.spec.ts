import { describe, expect, it } from 'vitest'
import { isExternalLink, resolveBannerLink } from './banner'

describe('isExternalLink', () => {
  it('treats http(s) links as external', () => {
    expect(isExternalLink('http://devshare.dev')).toBe(true)
    expect(isExternalLink('https://devshare.dev/courses')).toBe(true)
    expect(isExternalLink('HTTPS://devshare.dev')).toBe(true)
  })

  it('treats in-site paths as internal', () => {
    expect(isExternalLink('/article/1')).toBe(false)
    expect(isExternalLink('article/1')).toBe(false)
    expect(isExternalLink('//cdn.devshare.dev/a.png')).toBe(false)
    expect(isExternalLink('mailto:hi@devshare.dev')).toBe(false)
  })
})

describe('resolveBannerLink', () => {
  it('keeps external links untouched', () => {
    expect(resolveBannerLink(' https://devshare.dev/courses ')).toEqual({
      external: true,
      href: 'https://devshare.dev/courses',
    })
  })

  it('adds the leading slash to in-site paths', () => {
    expect(resolveBannerLink('article/1')).toEqual({ external: false, href: '/article/1' })
    expect(resolveBannerLink('/courses/2')).toEqual({ external: false, href: '/courses/2' })
  })
})
