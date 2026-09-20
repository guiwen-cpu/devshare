<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import type { ArticleDetail } from '@devshare/shared'
import { formatCount, formatDate } from '~/utils/format'
import type { PosterOptions } from '~/utils/poster'
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  buildPosterLink,
  loadImage,
  posterFileName,
  renderPosterToCanvas,
} from '~/utils/poster'

const props = defineProps<{
  modelValue: boolean
  article: ArticleDetail
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const toast = useToast()

/** 预览区容器，用来量出海报该缩到多小 */
const frameEl = ref<HTMLDivElement | null>(null)
/** 被截图的节点：就是预览里那张海报本身 */
const posterEl = ref<HTMLDivElement | null>(null)
/** 海报要展示的内容；图片没探通之前不渲染海报 DOM，免得截到半成品 */
const options = ref<PosterOptions | null>(null)
const generating = ref(false)
/** 海报按 750×1120 原尺寸排版、整体缩放进弹窗，导出时仍是原尺寸 */
const scale = ref(0)

function close() {
  emit('update:modelValue', false)
}

/** 等比缩到容器宽度内，同时别把弹窗撑得超出视口 */
function fit() {
  if (!import.meta.client) return
  const el = frameEl.value
  if (!el) return
  const style = window.getComputedStyle(el)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const availWidth = el.clientWidth - padding
  const availHeight = Math.max(260, window.innerHeight - 300)
  scale.value = Math.min(1, availWidth / POSTER_WIDTH, availHeight / POSTER_HEIGHT)
}

/**
 * 先探一遍封面和头像：取不回来的图片不进 DOM，预览里就不会出现裂图，
 * 截图时也不会因为跨域图片污染画布而导不出来（污染之后 toBlob 直接抛 SecurityError）。
 */
async function prepare() {
  const { article } = props
  const siteUrl = String(config.public.siteUrl ?? '')
  const articlePath = localePath(`/article/${article.id}`)
  const [cover, avatar, qr] = await Promise.all([
    loadImage(article.cover),
    loadImage(article.author.avatar),
    // 二维码里放完整地址（带协议头），手机扫了才能直接打开文章
    createPosterQr(buildPosterUrl(siteUrl, articlePath)),
  ])
  options.value = {
    article,
    cover,
    avatar,
    brandName: 'DevShare',
    slogan: t('brand.slogan'),
    link: buildPosterLink(siteUrl, articlePath),
    meta: `${formatDate(article.publishedAt, locale.value)} · ${t('article.views')} ${formatCount(article.viewCount)}`,
    coverPlaceholder: t('article.posterNoCover'),
    qr,
    qrHint: t('article.posterScan'),
  }
  await nextTick()
  // 等字体就位再量尺寸：字体回退会改变文本行数，量早了预览会再跳一下
  if (document.fonts) await document.fonts.ready
  fit()
}

/**
 * 预览是实打实的 DOM，不用提前画图；点下载时才把预览这份 HTML 交给 html2canvas，
 * 截成 2 倍图再走 Blob 下载。
 */
async function download() {
  if (!import.meta.client || generating.value) return
  const element = posterEl.value
  if (!element) return
  generating.value = true
  try {
    const canvas = await renderPosterToCanvas(element)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('海报导出失败')

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = posterFileName(props.article.title)
    document.body.appendChild(link)
    link.click()
    link.remove()
    // 立刻 revoke 在部分浏览器会打断下载，延后释放更稳
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(t('article.posterSaved'))
  } catch {
    toast.error(t('article.posterFailed'))
  } finally {
    generating.value = false
  }
}

// 弹窗打开（或换了文章）之后才准备内容：海报 DOM 只存在于客户端
watch(
  () => [props.modelValue, props.article.id] as const,
  async ([open]) => {
    if (!open) return
    options.value = null
    await nextTick()
    fit()
    await prepare()
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('resize', fit))
onBeforeUnmount(() => window.removeEventListener('resize', fit))
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    :title="t('article.posterTitle')"
    width="34rem"
    @update:model-value="close"
  >
    <div class="flex flex-col gap-4">
      <!-- 预览就是海报本体：所见即所得，省掉一次 canvas 往返，也不会有两处版式漂移 -->
      <div
        ref="frameEl"
        class="flex justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div
          v-if="options && scale > 0"
          :style="{
            width: `${POSTER_WIDTH * scale}px`,
            height: `${POSTER_HEIGHT * scale}px`,
            borderRadius: '8px',
            overflow: 'hidden',
          }"
        >
          <!--
            缩放只加在这一层：海报节点自己仍是 750×1120 的原始版式。
            html2canvas 会把祖先的缩放照搬进截图，所以它在测量前会先把这份 transform 抹掉
            （见 utils/poster.ts 的 clearAncestorTransforms），预览这边不受影响。
          -->
          <div
            :style="{
              width: `${POSTER_WIDTH}px`,
              height: `${POSTER_HEIGHT}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }"
          >
            <div
              ref="posterEl"
              :style="{ width: `${POSTER_WIDTH}px`, height: `${POSTER_HEIGHT}px` }"
            >
              <ArticlePosterCard :options="options" />
            </div>
          </div>
        </div>
        <div v-else class="flex h-64 items-center justify-center">
          <BaseSpinner size="lg" />
        </div>
      </div>

      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-slate-400">{{ t('article.posterHint') }}</p>
        <BaseButton :loading="generating" :disabled="!options" @click="download">
          <Download class="w-4 h-4" />
          {{ t('article.posterDownload') }}
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
