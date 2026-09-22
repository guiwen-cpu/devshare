import { DIFFICULTY_LABELS, type CourseDifficulty } from '@devshare/shared'

/// 难度枚举 → 当前语言的标签，未知值原样返回，避免脏数据渲染成空白
export function difficultyLabel(difficulty: string, locale: string): string {
  const entry = DIFFICULTY_LABELS[difficulty as CourseDifficulty]
  if (!entry) return difficulty
  return locale === 'en' ? entry.en : entry.zh
}

/// 报名人数文案；0 也照常显示，保持卡片底部一行的高度稳定
export function enrollCountLabel(count: number, locale: string): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
  return locale === 'en' ? `${safe} enrolled` : `${safe}人报名`
}
