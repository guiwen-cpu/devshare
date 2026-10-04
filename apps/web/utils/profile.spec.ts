import { describe, expect, it } from 'vitest'
import { resolveProfileTab } from './profile'

describe('resolveProfileTab', () => {
  it('accepts the private tabs for the owner', () => {
    expect(resolveProfileTab('courses', true)).toBe('courses')
    expect(resolveProfileTab('collects', true)).toBe('collects')
    expect(resolveProfileTab('articles', true)).toBe('articles')
  })

  it('falls back to articles for visitors', () => {
    expect(resolveProfileTab('courses', false)).toBe('articles')
    expect(resolveProfileTab('collects', false)).toBe('articles')
  })

  it('ignores unknown, missing and repeated query values', () => {
    expect(resolveProfileTab(undefined, true)).toBe('articles')
    expect(resolveProfileTab('', true)).toBe('articles')
    expect(resolveProfileTab('drafts', true)).toBe('articles')
    expect(resolveProfileTab(['courses', 'collects'], true)).toBe('articles')
  })
})
