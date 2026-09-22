<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { BannerDTO } from '@devshare/shared'
import { gradientForSeed } from '~/utils/visual'
import { resolveBannerLink } from '~/utils/banner'

const props = defineProps<{ banners: BannerDTO[] }>()

const { t } = useI18n()
const localePath = useLocalePath()

// 自动切换间隔，同时喂给 JS 定时器和进度条动画，两者不会走散
const PLAY_INTERVAL = 5000

const items = computed(() =>
  props.banners.map((banner) => ({ banner, link: resolveBannerLink(banner.link) })),
)

const current = ref(0)
const paused = ref(false)
const reducedMotion = ref(false)
// 每次（重新）计时都自增，用 key 让进度条动画从头播，和定时器保持同一节拍
const cycle = ref(0)
// 图片加载失败的 banner，退回品牌渐变打底，避免出现破图图标
const failedImages = reactive(new Set<number>())
let timer: ReturnType<typeof setInterval> | null = null

const autoplay = computed(() => items.value.length > 1 && !reducedMotion.value)

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function start() {
  stop()
  if (!import.meta.client || !autoplay.value) return
  cycle.value += 1
  timer = setInterval(next, PLAY_INTERVAL)
}

function go(index: number) {
  current.value = index
  if (autoplay.value) start()
}

function next() {
  if (items.value.length < 2) return
  go((current.value + 1) % items.value.length)
}

function prev() {
  if (items.value.length < 2) return
  go((current.value - 1 + items.value.length) % items.value.length)
}

watch(
  () => items.value.length,
  () => {
    if (current.value >= items.value.length) current.value = 0
    start()
  },
)

// 悬停与键盘聚焦都暂停轮播：正在读内容的人不该被切走
watch(paused, (value) => (value ? stop() : start()))

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  start()
})
onBeforeUnmount(stop)
</script>

<template>
  <section
    class="relative h-64 overflow-hidden rounded-2xl shadow-md ring-1 ring-slate-900/5 sm:h-72"
    role="region"
    :aria-label="t('home.bannerRegion')"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div
      class="banner-track absolute inset-0 flex transition-transform duration-500 ease-out"
      :style="{ transform: `translateX(-${current * 100}%)` }"
    >
      <div
        v-for="(item, i) in items"
        :key="item.banner.id"
        class="relative h-full w-full flex-none overflow-hidden"
        :class="gradientForSeed(item.banner.id)"
        :aria-hidden="i !== current"
      >
        <img
          v-if="!failedImages.has(item.banner.id)"
          :src="item.banner.image"
          alt=""
          loading="lazy"
          class="absolute inset-0 h-full w-full object-cover"
          @error="failedImages.add(item.banner.id)"
        />
        <!-- 双层遮罩：横向压住左侧亮图保证白字可读，纵向托住底部控件带 -->
        <div
          class="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/50 to-slate-950/20"
          aria-hidden="true"
        />
        <div
          class="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent"
          aria-hidden="true"
        />

        <div
          class="pointer-events-none relative flex h-full flex-col justify-end px-6 pb-14 sm:px-12 sm:pb-12"
        >
          <h2
            class="line-clamp-2 max-w-[85%] text-2xl font-bold leading-snug tracking-tight text-white sm:max-w-[58%] sm:text-3xl"
          >
            {{ item.banner.title }}
          </h2>
          <p
            v-if="item.banner.subtitle"
            class="line-clamp-1 mt-2 max-w-[85%] text-sm text-white/80 sm:max-w-[58%]"
          >
            {{ item.banner.subtitle }}
          </p>
        </div>

        <!-- 整张幻灯片是一个链接；文字层 pointer-events-none，所以点到标题也是跳转 -->
        <NuxtLink
          v-if="!item.link.external"
          :to="localePath(item.link.href)"
          :tabindex="i === current ? 0 : -1"
          class="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          :aria-label="item.banner.title"
        />
        <a
          v-else
          :href="item.link.href"
          target="_blank"
          rel="noopener noreferrer"
          :tabindex="i === current ? 0 : -1"
          class="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
          :aria-label="t('home.bannerExternal', { title: item.banner.title })"
        />
      </div>
    </div>

    <div class="absolute bottom-4 right-4 z-20 flex items-center gap-3 sm:bottom-5 sm:right-6">
      <!-- 分段进度轨：既表示第几张，也用填充色表示距离自动切换还剩多久 -->
      <div class="flex items-center gap-1.5">
        <button
          v-for="(item, i) in items"
          :key="item.banner.id"
          type="button"
          class="relative h-1.5 overflow-hidden rounded-full bg-white/35 transition-all duration-300 hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :class="i === current ? 'w-8' : 'w-3'"
          :aria-label="t('home.bannerGo', { index: i + 1 })"
          :aria-current="i === current ? 'true' : undefined"
          @click="go(i)"
        >
          <span
            v-if="i === current && autoplay"
            :key="`${current}-${cycle}`"
            class="banner-progress absolute inset-y-0 left-0 rounded-full bg-accent-500"
            :class="{ 'banner-progress-paused': paused }"
            :style="{ animationDuration: `${PLAY_INTERVAL}ms` }"
            aria-hidden="true"
          />
          <span
            v-else-if="i === current"
            class="absolute inset-0 rounded-full bg-white"
            aria-hidden="true"
          />
        </button>
      </div>

      <div v-if="items.length > 1" class="flex items-center gap-1">
        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-label="t('home.bannerPrev')"
          @click="prev"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :aria-label="t('home.bannerNext')"
          @click="next"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
@keyframes banner-progress {
  from {
    width: 0%;
  }
  to {
    width: 100%;
  }
}

.banner-progress {
  animation-name: banner-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

.banner-progress-paused {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .banner-track {
    transition: none;
  }
}
</style>
