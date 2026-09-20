import { describe, expect, it } from 'vitest'
import {
  POSTER_FONT_FAMILY,
  POSTER_QR_BOX,
  POSTER_QR_QUIET,
  buildPosterLink,
  buildPosterUrl,
  createPosterQr,
  createTextMeasure,
  fitTags,
  posterFileName,
  posterFont,
  qrCellSize,
  truncateText,
  wrapText,
} from './poster'

/** 假测量函数：每个字符固定 10px，结果可预测 */
const measure = (text: string) => text.length * 10

describe('truncateText', () => {
  it('放得下就原样返回', () => {
    expect(truncateText('abc', measure, 30)).toBe('abc')
  })

  it('放不下就截断并补省略号', () => {
    const result = truncateText('abcdefghij', measure, 50)
    expect(result).toBe('abcd…')
    expect(measure(result)).toBeLessThanOrEqual(50)
  })
})

describe('wrapText', () => {
  it('中文逐字断行', () => {
    expect(wrapText('一二三四五六', measure, 30, 3)).toEqual(['一二三', '四五六'])
  })

  it('英文按单词断行', () => {
    expect(wrapText('hello world foo', measure, 60, 3)).toEqual(['hello', 'world', 'foo'])
  })

  it('单个超长单词按字符硬切', () => {
    expect(wrapText('abcdefgh', measure, 30, 3)).toEqual(['abc', 'def', 'gh'])
  })

  it('中英文混排既不丢字也不超宽', () => {
    const lines = wrapText('用 Canvas 画一张图', measure, 60, 4)
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(60)
    // 断行处的空格会被吃掉，其余字符一个不少
    expect(lines.join('')).toBe('用Canvas画一张图')
  })

  it('超出最大行数时最后一行补省略号', () => {
    const lines = wrapText('一二三四五六七八九十', measure, 30, 2)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('一二三')
    expect(lines[1]?.endsWith('…')).toBe(true)
  })

  it('空白文本直接返回空数组', () => {
    expect(wrapText('   ', measure, 100, 3)).toEqual([])
  })
})

/** 标签的排版参数，和模板里传的一致 */
const tagLayout = { maxTags: 4, padding: 32, gap: 12, maxTagWidth: 200 }

describe('fitTags', () => {
  it('排得下就全部保留', () => {
    expect(fitTags(['a', 'b'], measure, 100, tagLayout)).toEqual(['a', 'b'])
  })

  it('放不下就丢掉后面的，不换行', () => {
    expect(fitTags(['a', 'b', 'c'], measure, 100, tagLayout)).toEqual(['a', 'b'])
  })

  it('第一个标签无论多宽都会留下', () => {
    expect(fitTags(['abc'], measure, 50, tagLayout)).toEqual(['abc'])
  })

  it('超出 maxTags 的标签不参与排版', () => {
    expect(fitTags(['a', 'b', 'c', 'd', 'e'], measure, 1000, tagLayout)).toHaveLength(4)
  })

  it('单个标签过长时截断并补省略号', () => {
    const [label] = fitTags(['x'.repeat(30)], measure, 1000, tagLayout)
    expect(label?.endsWith('…')).toBe(true)
    expect(measure(label ?? '')).toBeLessThanOrEqual(tagLayout.maxTagWidth)
  })
})

describe('posterFileName', () => {
  it('把文件系统不认的字符换成短横线', () => {
    expect(posterFileName('a/b:c*d?e"f<g>h|i\\j')).toBe('a-b-c-d-e-f-g-h-i-j-poster.png')
  })

  it('连续空白折叠成一个短横线', () => {
    expect(posterFileName('hello   world')).toBe('hello-world-poster.png')
  })

  it('去掉首尾多余的短横线', () => {
    expect(posterFileName('  / 标题 ')).toBe('标题-poster.png')
  })

  it('标题为空时给个兜底名字', () => {
    expect(posterFileName('   ')).toBe('devshare-poster.png')
  })
})

describe('buildPosterLink', () => {
  it('去掉协议头', () => {
    expect(buildPosterLink('http://localhost:3000', '/article/1')).toBe('localhost:3000/article/1')
  })

  it('去掉末尾多余的斜杠', () => {
    expect(buildPosterLink('https://devshare.dev/', '/article/1')).toBe('devshare.dev/article/1')
    expect(buildPosterLink('https://devshare.dev//', '/en/article/2')).toBe(
      'devshare.dev/en/article/2',
    )
  })

  it('siteUrl 缺失时只留下路径', () => {
    expect(buildPosterLink('', '/article/1')).toBe('/article/1')
  })
})

describe('buildPosterUrl', () => {
  it('留协议头，去掉 siteUrl 末尾的斜杠', () => {
    expect(buildPosterUrl('https://devshare.dev/', '/article/1')).toBe(
      'https://devshare.dev/article/1',
    )
  })

  it('siteUrl 缺失时只留下路径', () => {
    expect(buildPosterUrl('', '/article/1')).toBe('/article/1')
  })
})

describe('qrCellSize', () => {
  it('向下取整，模块不落在半个像素上', () => {
    expect(qrCellSize(29, 116)).toBe(4)
    expect(qrCellSize(33, 116)).toBe(3)
  })

  it('挤不下时兜底 2px', () => {
    expect(qrCellSize(200, 116)).toBe(2)
    expect(qrCellSize(0, 116)).toBe(2)
  })
})

describe('createPosterQr', () => {
  it('出 PNG data URL，边长不超过白卡减去静默区', async () => {
    const qr = await createPosterQr('https://devshare.dev/article/1')
    expect(qr?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(qr?.size).toBeGreaterThan(0)
    expect(qr?.size).toBeLessThanOrEqual(POSTER_QR_BOX - POSTER_QR_QUIET * 2)
  })

  it('地址为空时不生成，页脚走退化分支', async () => {
    expect(await createPosterQr('')).toBeNull()
  })
})

describe('posterFont', () => {
  it('拼出 canvas 认的 font 简写', () => {
    expect(posterFont(700, 44)).toBe(`700 44px ${POSTER_FONT_FAMILY}`)
  })
})

describe('createTextMeasure', () => {
  it('没有 DOM 时退化成按字符数估算，不会抛错', () => {
    const measureText = createTextMeasure(400, 20)
    expect(measureText('abcd')).toBe(4 * 20 * 0.6)
  })
})
