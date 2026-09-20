<script setup lang="ts">
import type { CSSProperties } from 'vue'
import logoUrl from '~/assets/images/logo.svg'
import type { PosterOptions } from '~/utils/poster'
import {
  POSTER_AUTHOR_FONT,
  POSTER_AVATAR_SIZE,
  POSTER_AVATAR_TOP,
  POSTER_BAND_HEIGHT,
  POSTER_BRAND_FONT,
  POSTER_COLOR,
  POSTER_CONTENT_TOP,
  POSTER_CONTENT_WIDTH,
  POSTER_COVER_HEIGHT,
  POSTER_COVER_RADIUS,
  POSTER_COVER_TOP,
  POSTER_DIVIDER_Y,
  POSTER_FONT_FAMILY,
  POSTER_HEIGHT,
  POSTER_MAX_TAGS,
  POSTER_META_FONT,
  POSTER_PAD,
  POSTER_QR_BOX,
  POSTER_QR_HINT_FONT,
  POSTER_QR_TOP,
  POSTER_SLOGAN_FONT,
  POSTER_SUMMARY_FONT,
  POSTER_TAG_FONT,
  POSTER_TITLE_FONT,
  POSTER_WIDTH,
  createTextMeasure,
  fitTags,
  truncateText,
  wrapText,
} from '~/utils/poster'

const props = defineProps<{ options: PosterOptions }>()

/**
 * 这块 DOM 就是「海报的画布」：整体 750×1120 交给 html2canvas 截图。
 *
 * 所以这里不用任何 Tailwind 类 —— Tailwind v4 的颜色会编译成 oklch()，
 * html2canvas 解析不了会直接抛错（见 utils/poster.ts 开头的说明），
 * 颜色一律走内联 hex，排版用绝对定位 + 像素值，和 canvas 版的版面一一对应。
 */

/** 品牌文字的左边缘：给 logo 留出位置 */
const BRAND_TEXT_LEFT = POSTER_PAD + 78
/** 页脚文字的左边缘：给头像留出位置 */
const FOOTER_TEXT_LEFT = POSTER_PAD + POSTER_AVATAR_SIZE + 20
/** 二维码左侧那列文字的右边界：贴着白卡左缘留 20px */
const QR_TEXT_RIGHT = POSTER_PAD + POSTER_QR_BOX + 20
/** 两行文字的 top：与二维码白卡的下沿对齐 */
const QR_HINT_TOP = POSTER_QR_TOP + POSTER_QR_BOX - 50
const QR_LINK_TOP = POSTER_QR_TOP + POSTER_QR_BOX - 20

/** 测量函数的字体必须和模板里渲染用的完全一致，否则算出来的行数会对不上 */
const measure = {
  title: createTextMeasure(POSTER_TITLE_FONT.weight, POSTER_TITLE_FONT.size),
  summary: createTextMeasure(POSTER_SUMMARY_FONT.weight, POSTER_SUMMARY_FONT.size),
  tag: createTextMeasure(POSTER_TAG_FONT.weight, POSTER_TAG_FONT.size),
  author: createTextMeasure(POSTER_AUTHOR_FONT.weight, POSTER_AUTHOR_FONT.size),
  meta: createTextMeasure(POSTER_META_FONT.weight, POSTER_META_FONT.size),
}

// 折行在 JS 里算好、模板按行渲染：-webkit-line-clamp html2canvas 不认识，
// 交给 CSS 自己折行又会溢出、压到下面的内容
const titleLines = computed(() =>
  wrapText(
    props.options.article.title,
    measure.title,
    POSTER_CONTENT_WIDTH,
    POSTER_TITLE_FONT.maxLines,
  ),
)

const summaryLines = computed(() => {
  const summary = props.options.article.summary?.trim()
  if (!summary) return []
  return wrapText(summary, measure.summary, POSTER_CONTENT_WIDTH, POSTER_SUMMARY_FONT.maxLines)
})

const tagLabels = computed(() =>
  fitTags(
    props.options.article.tags.map((tag) => tag.name),
    measure.tag,
    POSTER_CONTENT_WIDTH,
    { maxTags: POSTER_MAX_TAGS, padding: 32, gap: 12, maxTagWidth: 200 },
  ),
)

const authorName = computed(() =>
  truncateText(props.options.article.author.username, measure.author, 220),
)
const initial = computed(
  () => props.options.article.author.username.trim().charAt(0).toUpperCase() || '?',
)
const metaText = computed(() => truncateText(props.options.meta, measure.meta, 300))
const linkText = computed(() => truncateText(props.options.link, measure.meta, 380))
const qrHintText = computed(() => truncateText(props.options.qrHint, measure.meta, 200))

/** logo 取不到时就把品牌文字挪回左边距，不至于留一块空白 */
const logoOk = ref(true)

const brandTextLeft = computed(() => (logoOk.value ? BRAND_TEXT_LEFT : POSTER_PAD))

const rootStyle: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  width: `${POSTER_WIDTH}px`,
  height: `${POSTER_HEIGHT}px`,
  backgroundColor: POSTER_COLOR.white,
  color: POSTER_COLOR.text,
  fontFamily: POSTER_FONT_FAMILY,
}

/** 字号 / 行高统一从这里出，保证和测量用的字体一致 */
function fontStyle(font: { weight: number; size: number; lineHeight?: number }) {
  return {
    fontWeight: String(font.weight),
    fontSize: `${font.size}px`,
    lineHeight: `${font.lineHeight ?? font.size}px`,
  }
}

/** 单行文本：算好的行不允许再折行，所以 nowrap（顺带忽略模板里的空白字符） */
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden' } as const
</script>

<template>
  <div :style="rootStyle">
    <!-- 品牌色带 -->
    <div
      :style="{
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${POSTER_WIDTH}px`,
        height: `${POSTER_BAND_HEIGHT}px`,
        backgroundImage: `linear-gradient(120deg, ${POSTER_COLOR.brand}, ${POSTER_COLOR.accent})`,
      }"
    />

    <!-- 右上角光斑，避免大面积纯色显得扁平 -->
    <div
      :style="{
        position: 'absolute',
        left: '530px',
        top: '-140px',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
      }"
    />

    <img
      v-if="logoOk"
      :src="logoUrl"
      alt=""
      :style="{
        position: 'absolute',
        left: `${POSTER_PAD}px`,
        top: '44px',
        width: '60px',
        height: '60px',
      }"
      @error="logoOk = false"
    />

    <div
      :style="{
        position: 'absolute',
        left: `${brandTextLeft}px`,
        top: '36px',
        color: POSTER_COLOR.white,
        ...fontStyle(POSTER_BRAND_FONT),
      }"
    >
      {{ options.brandName }}
    </div>
    <div
      :style="{
        position: 'absolute',
        left: `${brandTextLeft}px`,
        top: '88px',
        color: POSTER_COLOR.white,
        opacity: '0.85',
        ...fontStyle(POSTER_SLOGAN_FONT),
      }"
    >
      {{ options.slogan }}
    </div>

    <!-- 封面：取到了才画 img，否则用占位图形（浅色封面白底上没边界感，补一圈内描边） -->
    <div
      :style="{
        position: 'absolute',
        left: `${POSTER_PAD}px`,
        top: `${POSTER_COVER_TOP}px`,
        width: `${POSTER_CONTENT_WIDTH}px`,
        height: `${POSTER_COVER_HEIGHT}px`,
        borderRadius: `${POSTER_COVER_RADIUS}px`,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
      }"
    >
      <img
        v-if="options.cover"
        :src="options.cover"
        crossorigin="anonymous"
        alt=""
        :style="{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }"
      />
      <div
        v-else
        :style="{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '0 48px',
          textAlign: 'center',
          color: POSTER_COLOR.brandDeep,
          backgroundImage: `linear-gradient(120deg, ${POSTER_COLOR.brandSoft}, ${POSTER_COLOR.accentSoft})`,
          ...fontStyle({ weight: 600, size: 30 }),
        }"
      >
        {{ options.coverPlaceholder }}
      </div>
    </div>

    <!-- 正文：标题 / 摘要 / 标签按块累加，块高由行数决定 -->
    <div
      :style="{
        position: 'absolute',
        left: `${POSTER_PAD}px`,
        top: `${POSTER_CONTENT_TOP}px`,
        width: `${POSTER_CONTENT_WIDTH}px`,
        overflow: 'hidden',
      }"
    >
      <div
        v-for="(line, index) in titleLines"
        :key="`title-${index}`"
        :style="{ ...fontStyle(POSTER_TITLE_FONT), ...oneLine }"
      >
        {{ line }}
      </div>

      <div v-if="summaryLines.length" :style="{ marginTop: '8px' }">
        <div
          v-for="(line, index) in summaryLines"
          :key="`summary-${index}`"
          :style="{ ...fontStyle(POSTER_SUMMARY_FONT), color: POSTER_COLOR.muted, ...oneLine }"
        >
          {{ line }}
        </div>
      </div>

      <div
        v-if="tagLabels.length"
        :style="{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '12px',
          overflow: 'hidden',
        }"
      >
        <span
          v-for="(label, index) in tagLabels"
          :key="`tag-${index}`"
          :style="{
            height: '44px',
            padding: '0 16px',
            borderRadius: '22px',
            backgroundColor: POSTER_COLOR.brandSoft,
            color: POSTER_COLOR.brandDeep,
            ...fontStyle(POSTER_TAG_FONT),
            lineHeight: '44px',
            ...oneLine,
          }"
        >
          {{ label }}
        </span>
      </div>
    </div>

    <!-- 页脚 -->
    <div
      :style="{
        position: 'absolute',
        left: `${POSTER_PAD}px`,
        top: `${POSTER_DIVIDER_Y}px`,
        width: `${POSTER_CONTENT_WIDTH}px`,
        height: '1px',
        backgroundColor: POSTER_COLOR.border,
      }"
    />

    <div
      :style="{
        position: 'absolute',
        left: `${POSTER_PAD}px`,
        top: `${POSTER_AVATAR_TOP}px`,
        width: `${POSTER_AVATAR_SIZE}px`,
        height: `${POSTER_AVATAR_SIZE}px`,
        borderRadius: '50%',
        overflow: 'hidden',
      }"
    >
      <img
        v-if="options.avatar"
        :src="options.avatar"
        crossorigin="anonymous"
        alt=""
        :style="{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }"
      />
      <div
        v-else
        :style="{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: POSTER_COLOR.brandDeep,
          backgroundImage: `linear-gradient(135deg, ${POSTER_COLOR.brand100}, ${POSTER_COLOR.accent100})`,
          ...fontStyle({ weight: 600, size: 30 }),
        }"
      >
        {{ initial }}
      </div>
    </div>

    <div
      :style="{
        position: 'absolute',
        left: `${FOOTER_TEXT_LEFT}px`,
        top: `${POSTER_AVATAR_TOP + 8}px`,
        ...fontStyle(POSTER_AUTHOR_FONT),
        ...oneLine,
      }"
    >
      {{ authorName }}
    </div>

    <div
      :style="{
        position: 'absolute',
        left: `${FOOTER_TEXT_LEFT}px`,
        top: `${POSTER_AVATAR_TOP + 44}px`,
        color: POSTER_COLOR.faint,
        ...fontStyle(POSTER_META_FONT),
        ...oneLine,
      }"
    >
      {{ metaText }}
    </div>

    <!-- 二维码：白卡里的留白就是扫码要的静默区，码的尺寸由生成结果决定 -->
    <div
      v-if="options.qr"
      :style="{
        position: 'absolute',
        right: `${POSTER_PAD}px`,
        top: `${POSTER_QR_TOP}px`,
        width: `${POSTER_QR_BOX}px`,
        height: `${POSTER_QR_BOX}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '16px',
        border: '1px solid rgba(15, 23, 42, 0.08)',
        backgroundColor: POSTER_COLOR.white,
      }"
    >
      <img
        :src="options.qr.dataUrl"
        alt=""
        :style="{
          display: 'block',
          width: `${options.qr.size}px`,
          height: `${options.qr.size}px`,
        }"
      />
    </div>

    <!-- 码旁两行字：提示在上、链接在下，都与白卡下沿对齐 -->
    <div
      v-if="options.qr"
      :style="{
        position: 'absolute',
        right: `${QR_TEXT_RIGHT}px`,
        top: `${QR_HINT_TOP}px`,
        color: POSTER_COLOR.brandDeep,
        textAlign: 'right',
        ...fontStyle(POSTER_QR_HINT_FONT),
        ...oneLine,
      }"
    >
      {{ qrHintText }}
    </div>

    <div
      v-if="options.qr"
      :style="{
        position: 'absolute',
        right: `${QR_TEXT_RIGHT}px`,
        top: `${QR_LINK_TOP}px`,
        color: POSTER_COLOR.faint,
        textAlign: 'right',
        ...fontStyle(POSTER_META_FONT),
        ...oneLine,
      }"
    >
      {{ linkText }}
    </div>

    <!-- 码生成失败时退回原来的右对齐链接，页脚不至于空着 -->
    <div
      v-if="!options.qr"
      :style="{
        position: 'absolute',
        right: `${POSTER_PAD}px`,
        top: `${POSTER_AVATAR_TOP + 26}px`,
        color: POSTER_COLOR.faint,
        textAlign: 'right',
        ...fontStyle(POSTER_META_FONT),
        ...oneLine,
      }"
    >
      {{ linkText }}
    </div>
  </div>
</template>
