import { describe, expect, it } from 'vitest'
import { difficultyLabel, enrollCountLabel } from './course'

describe('difficultyLabel', () => {
  it('maps every difficulty to both locales', () => {
    expect(difficultyLabel('beginner', 'zh')).toBe('入门')
    expect(difficultyLabel('elementary', 'zh')).toBe('初级')
    expect(difficultyLabel('intermediate', 'zh')).toBe('中级')
    expect(difficultyLabel('advanced', 'zh')).toBe('高级')
    expect(difficultyLabel('beginner', 'en')).toBe('Beginner')
    expect(difficultyLabel('advanced', 'en')).toBe('Advanced')
  })

  it('falls back to the raw value for unknown input', () => {
    expect(difficultyLabel('expert', 'zh')).toBe('expert')
  })
})

describe('enrollCountLabel', () => {
  it('renders the enrollment count in the active locale', () => {
    expect(enrollCountLabel(34, 'zh')).toBe('34人报名')
    expect(enrollCountLabel(34, 'en')).toBe('34 enrolled')
  })

  it('floors fractional and negative counts to zero', () => {
    expect(enrollCountLabel(0, 'zh')).toBe('0人报名')
    expect(enrollCountLabel(-3, 'zh')).toBe('0人报名')
    expect(enrollCountLabel(Number.NaN, 'en')).toBe('0 enrolled')
  })
})
