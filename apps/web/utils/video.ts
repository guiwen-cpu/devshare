import { VIDEO_MIME_TYPES } from '@devshare/shared'

/// 进度条与时间码：不足 1 小时用 m:ss，超过 1 小时用 h:mm:ss；脏数据一律按 0 处理
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  if (hours > 0) return hours + ':' + pad(minutes) + ':' + pad(secs)
  return minutes + ':' + pad(secs)
}

/// 低于这个秒数当作「刚点开」，距结尾不足下面这个秒数当作「已看完」，两种情况都不提示续播
const RESUME_MIN_SECONDS = 5
const RESUME_END_THRESHOLD_SECONDS = 10

/// 该从哪一秒接着播；返回 0 表示从头播（没记录、刚开头、或已接近结尾）
export function resumePosition(saved: number, duration: number): number {
  if (!Number.isFinite(saved) || saved < RESUME_MIN_SECONDS) return 0
  const nearEnd =
    Number.isFinite(duration) && duration > 0 && saved > duration - RESUME_END_THRESHOLD_SECONDS
  if (nearEnd) return 0
  return Math.floor(saved)
}

/// 观看进度按课程分开存，切课程互不覆盖
export function videoProgressKey(courseId: number): string {
  return 'df_video_progress_' + courseId
}

/// 解析 localStorage 里的观看进度；兼容早期只存一个数字的写法，坏数据返回 null
export function parseStoredProgress(raw: string | null): number | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  let value = Number.NaN
  if (typeof parsed === 'number') value = parsed
  else if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as { t?: unknown }).t === 'number'
  ) {
    value = (parsed as { t: number }).t
  }
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/// 白名单校验；默认用共享常量，管理员页会把后端 config.accept 传进来
export function isAllowedVideoMime(
  mimetype: string,
  allowed: readonly string[] = VIDEO_MIME_TYPES,
): boolean {
  return allowed.includes(mimetype)
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/// 人类可读体积，用于 i18n 文案里的 {size} 参数
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return value.toFixed(digits) + ' ' + SIZE_UNITS[unit]
}
