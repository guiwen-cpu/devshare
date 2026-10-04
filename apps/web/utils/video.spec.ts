import { describe, expect, it } from 'vitest'
import {
  formatFileSize,
  formatTime,
  isAllowedVideoMime,
  parseStoredProgress,
  resumePosition,
  videoProgressKey,
} from './video'

describe('formatTime', () => {
  it('renders m:ss below one hour', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(59)).toBe('0:59')
    expect(formatTime(725)).toBe('12:05')
  })

  it('renders h:mm:ss at and above one hour', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3851)).toBe('1:04:11')
  })

  it('treats NaN and negatives as zero', () => {
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(-5)).toBe('0:00')
  })
})

describe('resumePosition', () => {
  it('returns the saved second when it is worth resuming', () => {
    expect(resumePosition(30, 600)).toBe(30)
    expect(resumePosition(30.9, 600)).toBe(30)
  })

  it('ignores a barely-started position', () => {
    expect(resumePosition(2, 600)).toBe(0)
  })

  it('ignores a position close to the end', () => {
    expect(resumePosition(595, 600)).toBe(0)
    expect(resumePosition(585, 600)).toBe(585)
  })

  it('falls back to the saved second when the duration is unknown', () => {
    expect(resumePosition(120, 0)).toBe(120)
    expect(resumePosition(120, Number.NaN)).toBe(120)
  })

  it('returns zero for dirty values', () => {
    expect(resumePosition(Number.NaN, 600)).toBe(0)
    expect(resumePosition(-1, 600)).toBe(0)
  })
})

describe('videoProgressKey', () => {
  it('namespaces the key per course', () => {
    expect(videoProgressKey(7)).toBe('df_video_progress_7')
  })
})

describe('parseStoredProgress', () => {
  it('reads the object shape and the legacy numeric shape', () => {
    expect(parseStoredProgress('{"t":42}')).toBe(42)
    expect(parseStoredProgress('42')).toBe(42)
  })

  it('returns null for missing or dirty data', () => {
    expect(parseStoredProgress(null)).toBeNull()
    expect(parseStoredProgress('')).toBeNull()
    expect(parseStoredProgress('not json')).toBeNull()
    expect(parseStoredProgress('null')).toBeNull()
    expect(parseStoredProgress('{"t":"x"}')).toBeNull()
    expect(parseStoredProgress('{"t":-1}')).toBeNull()
  })
})

describe('isAllowedVideoMime', () => {
  it('accepts the whitelisted video types', () => {
    expect(isAllowedVideoMime('video/mp4')).toBe(true)
    expect(isAllowedVideoMime('video/webm')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isAllowedVideoMime('video/quicktime')).toBe(false)
    expect(isAllowedVideoMime('image/png')).toBe(false)
    expect(isAllowedVideoMime('')).toBe(false)
  })

  it('honours an explicit allow list', () => {
    expect(isAllowedVideoMime('video/mp4', ['video/webm'])).toBe(false)
    expect(isAllowedVideoMime('video/webm', ['video/webm'])).toBe(true)
  })
})

describe('formatFileSize', () => {
  it('formats bytes, megabytes and gigabytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatFileSize(4096 * 1024 * 1024)).toBe('4.0 GB')
  })

  it('treats zero and dirty values as zero', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(-1)).toBe('0 B')
    expect(formatFileSize(Number.NaN)).toBe('0 B')
  })
})
