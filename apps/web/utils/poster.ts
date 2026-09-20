import type { ArticleDetail } from '@devshare/shared'

/**
 * 文章海报：与渲染无关的纯逻辑 + html2canvas 封装。
 *
 * 版面本身由 ArticlePosterCard.vue 用 DOM / CSS 排出来，html2canvas 负责把节点截成图片。
 * 这里只保留三类东西：
 *  1. 尺寸、配色、字体常量 —— 模板和文字测量共用，避免两边对不上；
 *  2. 折行、截断、文件名这类纯函数 —— 脱离浏览器也能单测；
 *  3. renderPosterToCanvas / createPosterQr —— 下载时把海报节点截成 canvas（预览不画 canvas，
 *     直接看 DOM），以及把文章地址生成页脚用的二维码。
 *
 * 注意：海报节点里的颜色必须是 hex 或 rgb，不能出现 oklch()。
 * html2canvas 1.4.1 解析到 oklch 会直接抛 unsupported color function，
 * 而 Tailwind v4 的默认调色板（slate / red …）恰好就是 oklch，
 * 所以海报模板里不能用任何 Tailwind 颜色类，颜色一律走内联 style。
 */

/** 海报逻辑宽度 */
export const POSTER_WIDTH = 750
/** 海报逻辑高度 */
export const POSTER_HEIGHT = 1120
/** 导出倍率：既是 html2canvas 的 scale，也是导出图相对逻辑尺寸的倍数 */
export const POSTER_SCALE = 2
/** 海报上最多展示的标签数 */
export const POSTER_MAX_TAGS = 4
/** 海报内边距 */
export const POSTER_PAD = 48
/** 内容区宽度 */
export const POSTER_CONTENT_WIDTH = POSTER_WIDTH - POSTER_PAD * 2
/** 顶部品牌色带高度，封面图会压住它的下沿，形成层次 */
export const POSTER_BAND_HEIGHT = 200
/** 封面区块：位置与圆角 */
export const POSTER_COVER_TOP = 132
export const POSTER_COVER_HEIGHT = 300
export const POSTER_COVER_RADIUS = 24
/** 正文区块的起始 y */
export const POSTER_CONTENT_TOP = 494
/** 页脚：分隔线与头像 */
export const POSTER_DIVIDER_Y = 878
export const POSTER_AVATAR_TOP = 906
export const POSTER_AVATAR_SIZE = 64
/** 页脚二维码：贴在右下角的白卡；卡内留白就是扫码要求的静默区 */
export const POSTER_QR_TOP = POSTER_AVATAR_TOP
export const POSTER_QR_BOX = 148
export const POSTER_QR_QUIET = 16

/** 字号 / 行高：模板的 style 和 canvas 的 measureText 都取这里，测量和渲染才不会打架 */
export const POSTER_TITLE_FONT = { weight: 700, size: 44, lineHeight: 60, maxLines: 3 } as const
export const POSTER_SUMMARY_FONT = { weight: 400, size: 26, lineHeight: 40, maxLines: 2 } as const
export const POSTER_TAG_FONT = { weight: 500, size: 22 } as const
export const POSTER_BRAND_FONT = { weight: 700, size: 38 } as const
export const POSTER_SLOGAN_FONT = { weight: 400, size: 21 } as const
export const POSTER_AUTHOR_FONT = { weight: 600, size: 28 } as const
export const POSTER_META_FONT = { weight: 400, size: 20 } as const
export const POSTER_QR_HINT_FONT = { weight: 600, size: 20 } as const

/**
 * 字体栈与 assets/css/main.css 的 --font-sans 对齐。
 * 多词字体名不加引号也是合法写法，这里统一不加，省得 canvas 的 font 简写和 CSS 两处写法漂移。
 */
export const POSTER_FONT_FAMILY =
  'Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif'

/** 品牌配色，取自 main.css 的 --color-brand-* / --color-accent-* */
export const POSTER_COLOR = {
  brand: '#2f6bff',
  brandDeep: '#1f4fe8',
  brandSoft: '#eef4ff',
  brand100: '#d9e6ff',
  accent: '#00c2a8',
  accentSoft: '#e6fbf8',
  accent100: '#c2f5ee',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  white: '#ffffff',
} as const

/** 文本宽度测量函数：真实场景传 canvas.measureText，单测里传假实现即可 */
export type MeasureText = (text: string) => number

/** canvas 的 font 简写，例如 `700 44px Inter, …` */
export function posterFont(weight: number, size: number): string {
  return `${weight} ${size}px ${POSTER_FONT_FAMILY}`
}

/**
 * 用一张离屏 canvas 造测量函数。字体必须和模板里用的完全一致，否则算出来的行数会对不上。
 * 没有 DOM 时（SSR / 单测）退化成按字符数估算，调用方就不用到处判空。
 */
export function createTextMeasure(weight: number, size: number): MeasureText {
  const fallback: MeasureText = (text) => text.length * size * 0.6
  if (typeof document === 'undefined') return fallback
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return fallback
  ctx.font = posterFont(weight, size)
  return (text) => ctx.measureText(text).width
}

/** 中日韩文字与全角标点：可以逐字断行；其余按空格断行 */
function isCjk(ch: string): boolean {
  return /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)
}

/** 把文本切成「可断行单元」：汉字/标点各成一个单元，英文单词整体一个单元 */
function tokenize(text: string): string[] {
  const tokens: string[] = []
  let word = ''
  for (const ch of text) {
    if (isCjk(ch)) {
      if (word) {
        tokens.push(word)
        word = ''
      }
      tokens.push(ch)
    } else if (ch === ' ') {
      if (word) {
        tokens.push(word)
        word = ''
      }
      tokens.push(' ')
    } else {
      word += ch
    }
  }
  if (word) tokens.push(word)
  return tokens
}

/** 单个单元就超过一行宽度时（超长 URL），按字符硬切 */
function chunkToken(token: string, measure: MeasureText, maxWidth: number): string[] {
  if (measure(token) <= maxWidth) return [token]
  const chunks: string[] = []
  let current = ''
  for (const ch of token) {
    if (current && measure(current + ch) > maxWidth) {
      chunks.push(current)
      current = ch
    } else {
      current += ch
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/** 一定补上省略号，用来表示「后面还有内容」 */
export function ellipsize(text: string, measure: MeasureText, maxWidth: number): string {
  let cut = text
  while (cut && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1)
  return cut ? `${cut}…` : '…'
}

/** 截断成一行：放得下就原样返回，放不下才补省略号 */
export function truncateText(text: string, measure: MeasureText, maxWidth: number): string {
  return measure(text) <= maxWidth ? text : ellipsize(text, measure, maxWidth)
}

/**
 * 折行排版；超过 maxLines 时丢弃多余的行，并在最后一行末尾补省略号。
 * 返回的每一行都已经 trim 过行尾空格。
 *
 * 之所以在 JS 里算好行、模板再按行渲染：CSS 的 -webkit-line-clamp html2canvas 不支持，
 * 而放任它自己折行又会溢出、压到下面的内容。
 */
export function wrapText(
  text: string,
  measure: MeasureText,
  maxWidth: number,
  maxLines: number,
): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const tokens = tokenize(normalized).flatMap((token) =>
    token === ' ' ? [token] : chunkToken(token, measure, maxWidth),
  )

  const lines: string[] = []
  let line = ''
  for (const token of tokens) {
    const candidate = line + token
    if (line && measure(candidate.trimEnd()) > maxWidth) {
      lines.push(line.trimEnd())
      line = token === ' ' ? '' : token
    } else {
      line = candidate
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd())

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1] ?? '', measure, maxWidth)
  return kept
}

/**
 * 挑出能排在同一行里的标签，返回它们最终展示的文案。
 * 宁可少画一个，也不换行破坏版式；第一个标签一定会留下。
 */
export function fitTags(
  names: string[],
  measure: MeasureText,
  maxWidth: number,
  layout: { maxTags: number; padding: number; gap: number; maxTagWidth: number },
): string[] {
  const kept: string[] = []
  let used = 0
  for (const name of names.slice(0, layout.maxTags)) {
    const label = truncateText(name, measure, layout.maxTagWidth)
    const width = measure(label) + layout.padding
    if (kept.length && used + layout.gap + width > maxWidth) break
    used += (kept.length ? layout.gap : 0) + width
    kept.push(label)
  }
  return kept
}

/**
 * 试探图片能不能取回来，取不回来给 null，调用方据此走占位分支。
 *
 * 必须带 crossOrigin：封面/头像一旦跨域且服务端没开 CORS，画布会被「污染」，
 * 之后 toBlob 直接抛 SecurityError，整张海报都导不出来。
 * 提前探一次，海报 DOM 里就只会出现确定画得出来的图片。
 */
export function loadImage(src: string | null | undefined): Promise<string | null> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(src)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** 页脚二维码：PNG data URL + 它在 CSS 里的边长 */
export interface PosterQr {
  dataUrl: string
  size: number
}

/**
 * 每个二维码模块在 CSS 里占几个像素。
 *
 * 必须取整：模块尺寸不是整数像素时，浏览器要把每个格子插值出灰边，码就糊了，
 * 手机得凑很近才认得出来。这里向下取整，优先保证白卡里的静默区够宽。
 */
export function qrCellSize(moduleCount: number, target: number): number {
  if (!Number.isFinite(moduleCount) || moduleCount <= 0) return 2
  return Math.max(2, Math.floor(target / moduleCount))
}

/**
 * 把地址生成二维码。内容要是带协议头的完整 URL，手机扫了才能直接打开文章。
 *
 * 三个决定：
 *  1. 出 PNG data URL，不往海报里塞 canvas —— 海报节点最终交给 html2canvas，
 *     data URL 图片不跨域、不污染画布，和封面/头像走同一套逻辑；
 *  2. 每模块的像素数是整数，导出又是 2 倍图（scale = 单元格 × 2），
 *     一个模块正好落在 2×2 个设备像素上，放大后依然锐利；
 *  3. 静默区不画在二维码图里（margin: 0），交给页脚那张白卡的留白提供 —— 留白宽度
 *     因此跟海报栅格对齐，而不是随二维码版本浮动。
 * 生成失败返回 null，页脚退化成只显示链接。
 */
export async function createPosterQr(
  text: string,
  box: number = POSTER_QR_BOX,
): Promise<PosterQr | null> {
  if (!text) return null
  try {
    const { create, toDataURL } = await import('qrcode')
    const options = { errorCorrectionLevel: 'M' } as const
    const moduleCount = create(text, options).modules.size
    const cell = qrCellSize(moduleCount, box - POSTER_QR_QUIET * 2)
    return {
      dataUrl: await toDataURL(text, {
        ...options,
        margin: 0,
        scale: cell * 2,
        color: { dark: POSTER_COLOR.text, light: POSTER_COLOR.white },
      }),
      size: moduleCount * cell,
    }
  } catch {
    return null
  }
}

/** 海报要展示的内容；图片地址已经提前探过能否取回 */
export interface PosterOptions {
  article: ArticleDetail
  /** 能取回来的封面地址，取不到给 null 走占位 */
  cover: string | null
  /** 能取回来的头像地址，取不到给 null 走首字母占位 */
  avatar: string | null
  brandName: string
  slogan: string
  /** 底部展示的链接（建议去掉协议头） */
  link: string
  /** 作者下方那行元信息，例如「2025年9月17日 · 阅读 1.2w」 */
  meta: string
  /** 没有封面图时的占位文案 */
  coverPlaceholder: string
  /** 页脚二维码；生成失败给 null，页脚退化成只显示链接 */
  qr: PosterQr | null
  /** 二维码旁的提示文案（扫码看原文） */
  qrHint: string
}

/**
 * 抹掉祖先节点上的 transform。
 *
 * 弹窗预览里的海报是套在 `transform: scale()` 里缩着看的（不然 750×1120 塞不进去），
 * 而 html2canvas 是按每个节点的 getBoundingClientRect 来排版的 —— 祖先的缩放会被照搬，
 * 结果整张海报缩在画布左上角。onclone 在测量之前执行，这里只改截图用的那份副本，预览不动。
 */
function clearAncestorTransforms(element: HTMLElement | null, doc: Document): void {
  let node: HTMLElement | null = element ? element.parentElement : doc.body
  while (node) {
    if (node.style.transform) node.style.transform = 'none'
    node = node.parentElement
  }
}

/**
 * 截图期间，把字体基线量测所需的排版环境还原成浏览器默认值。
 *
 * 坑出在 html2canvas 1.4.1 的实现上：它量基线用的 document 不是截图副本、而是**当前页面** ——
 * 往 body 尾部临时插一个隐藏容器（一个 span 加一个 1×1 的探针 <img>），
 * 再用 img.offsetTop - span.offsetTop 反推基线位置。这依赖两条浏览器默认行为：
 *  1. 探针 <img> 是行内元素：Tailwind v4 的 preflight 写了 img { display: block }，
 *     探针图于是掉到下一行，量出来的“基线”变成了整行行高，文字被画低约一行；
 *  2. 隐藏容器按 line-height: normal 继承：preflight 在 html 上写了 line-height: 1.5，
 *     基线再偏半行行距。
 * 两个偏差叠加后文字被画低一行多，又被每行自己的 overflow: hidden 裁掉一截 ——
 * 对外的现象就是「下载下来的海报文字缺了一截，但弹窗预览是正常的」。
 *
 * 测量发生在当前文档，html2canvas 又没有对应开关，所以只能在截图期间临时补两条规则：
 * 选择器只命中它那个探针容器（body 直接子节点里带 visibility: hidden 的那个），
 * 不碰页面上的其它图片与文本，截图结束后立刻移除。
 */
const TEXT_METRICS_STYLE = [
  `body > div[style*='visibility: hidden'] { line-height: normal; }`,
  `body > div[style*='visibility: hidden'] > img { display: inline; }`,
].join('\n')

function withDefaultTextMetrics<T>(task: () => Promise<T>): Promise<T> {
  const style = document.createElement('style')
  style.textContent = TEXT_METRICS_STYLE
  document.head.appendChild(style)
  return task().finally(() => style.remove())
}

/**
 * 把海报节点截成图片，返回尺寸为「逻辑尺寸 × scale」的 canvas。
 *
 * 只在下载时调用：弹窗里的预览就是海报 DOM 本身，不需要先画一张 canvas。
 * 显式给 width / height，加上抹掉祖先 transform，截出来的始终是 750×1120 的整版。
 *
 * useCORS 配合 allowTaint 默认的 false：跨域图片取不到就跳过，不会把画布弄脏。
 */
export async function renderPosterToCanvas(
  element: HTMLElement,
  scale: number = POSTER_SCALE,
): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return withDefaultTextMetrics(() =>
    html2canvas(element, {
      scale,
      width: POSTER_WIDTH,
      height: POSTER_HEIGHT,
      backgroundColor: POSTER_COLOR.white,
      useCORS: true,
      logging: false,
      onclone: (doc, clonedElement) => clearAncestorTransforms(clonedElement, doc),
    }),
  )
}

/** 文件名的非法字符统一换成短横线，避免不同系统下载时被截断 */
export function posterFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'devshare'}-poster.png`
}

/** 二维码里放的完整地址：带协议头才扫得动；siteUrl 末尾多余的斜杠一并去掉 */
export function buildPosterUrl(siteUrl: string, path: string): string {
  const site = String(siteUrl ?? '').replace(/\/+$/, '')
  return `${site}${path}`
}

/** 海报底部的链接：去掉协议头更好看 */
export function buildPosterLink(siteUrl: string, path: string): string {
  return buildPosterUrl(siteUrl, path).replace(/^https?:\/\//, '')
}
