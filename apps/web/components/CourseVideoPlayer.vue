<script setup lang="ts">
// 课程视频播放器：底层用原生 <video>，控制条完全自己画 —— 播放/暂停、可拖拽进度条
// （已缓冲 + 已播）、时间码、音量/静音、倍速、全屏、快捷键，以及按课程记录的续播。
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-vue-next'
import { formatTime, parseStoredProgress, resumePosition, videoProgressKey } from '~/utils/video'

const props = defineProps<{
  src: string
  poster?: string | null
  courseId: number
  title?: string | null
}>()

const { t } = useI18n()

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const HIDE_DELAY_MS = 2500
const SEEK_STEP_SECONDS = 5
const VOLUME_STEP = 0.05
const SAVE_INTERVAL_MS = 4000

const rootRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const barRef = ref<HTMLElement | null>(null)

const playing = ref(false)
const started = ref(false)
const waiting = ref(false)
const failed = ref(false)
const dragging = ref(false)
const focusWithin = ref(false)
const controlsVisible = ref(true)
const fullscreen = ref(false)

const currentTime = ref(0)
const duration = ref(0)
const buffered = ref(0)
const volume = ref(1)
const muted = ref(false)
const rate = ref(1)

const resumeAt = ref(0)
const resumeDismissed = ref(false)

const storageKey = computed(() => videoProgressKey(props.courseId))
const hasResume = computed(() => resumeAt.value > 0 && !resumeDismissed.value)
/// 暂停、拖拽、焦点在控制条里时都保持可见，其余情况只在播放中短暂出现
const showBar = computed(
  () => controlsVisible.value || !playing.value || dragging.value || focusWithin.value,
)
const playedPercent = computed(
  () => (duration.value > 0 ? (currentTime.value / duration.value) * 100 : 0).toFixed(3) + '%',
)
const bufferedPercent = computed(
  () => (duration.value > 0 ? (buffered.value / duration.value) * 100 : 0).toFixed(3) + '%',
)
const VolumeIcon = computed(() => {
  if (muted.value || volume.value === 0) return VolumeX
  return volume.value < 0.5 ? Volume1 : Volume2
})

// 带引号的文案先在脚本里拼好，模板属性就能统一用单引号，避免属性值里再套引号
const regionLabel = computed(() => t('course.video'))
const playLabel = computed(() => (playing.value ? t('player.pause') : t('player.play')))
const muteLabel = computed(() => (muted.value ? t('player.unmute') : t('player.mute')))
const fullscreenLabel = computed(() =>
  fullscreen.value ? t('player.exitFullscreen') : t('player.fullscreen'),
)
const timeLabel = computed(() => formatTime(currentTime.value) + ' / ' + formatTime(duration.value))
const resumeCaption = computed(() => t('player.resumePrompt', { time: formatTime(resumeAt.value) }))
const resumeLabel = computed(() => t('player.resumeContinue', { time: formatTime(resumeAt.value) }))

let hideTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedAt = 0

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

/// 显示控制条；正在播放时 2.5s 无操作自动淡出（焦点在控制条里时不淡出）
function revealControls() {
  controlsVisible.value = true
  clearHideTimer()
  if (!playing.value) return
  hideTimer = setTimeout(() => {
    if (focusWithin.value || dragging.value) return
    controlsVisible.value = false
  }, HIDE_DELAY_MS)
}

function hideControlsOnLeave() {
  if (!playing.value) return
  clearHideTimer()
  controlsVisible.value = false
}

async function togglePlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    try {
      await video.play()
    } catch {
      // 浏览器在极端情况下会拒绝播放（如策略限制），此时维持暂停即可
    }
  } else {
    video.pause()
  }
}

function seekBy(delta: number) {
  const video = videoRef.value
  if (!video) return
  const upper = Number.isFinite(video.duration) ? video.duration : video.currentTime
  const next = Math.min(Math.max(0, video.currentTime + delta), upper)
  video.currentTime = next
  currentTime.value = next
}

function setVolume(next: number) {
  const video = videoRef.value
  if (!video) return
  const value = Math.min(1, Math.max(0, Math.round(next * 100) / 100))
  video.volume = value
  video.muted = value === 0
  volume.value = value
  muted.value = video.muted
}

function changeVolume(delta: number) {
  const video = videoRef.value
  if (!video) return
  setVolume(video.volume + delta)
}

function toggleMute() {
  const video = videoRef.value
  if (!video) return
  video.muted = !video.muted
  muted.value = video.muted
}

function toggleFullscreen() {
  if (!import.meta.client) return
  const root = rootRef.value
  if (!root) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void root.requestFullscreen()
}

function reload() {
  const video = videoRef.value
  if (!video) return
  failed.value = false
  video.load()
}

function dismissResume() {
  resumeDismissed.value = true
}

async function resumePlay() {
  const video = videoRef.value
  if (!video) return
  video.currentTime = resumeAt.value
  resumeDismissed.value = true
  await togglePlay()
}

async function restartFromStart() {
  const video = videoRef.value
  if (!video) return
  video.currentTime = 0
  resumeDismissed.value = true
  await togglePlay()
}

function ratioFromEvent(event: PointerEvent): number {
  const bar = barRef.value
  if (!bar) return 0
  const rect = bar.getBoundingClientRect()
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

function seekToRatio(ratio: number) {
  const video = videoRef.value
  if (!video || !Number.isFinite(duration.value) || duration.value <= 0) return
  const target = ratio * duration.value
  video.currentTime = target
  currentTime.value = target
}

function onBarPointerDown(event: PointerEvent) {
  if (duration.value <= 0) return
  dragging.value = true
  dismissResume()
  seekToRatio(ratioFromEvent(event))
  barRef.value?.setPointerCapture(event.pointerId)
  revealControls()
}

function onBarPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  seekToRatio(ratioFromEvent(event))
}

function onBarPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  barRef.value?.releasePointerCapture(event.pointerId)
  revealControls()
}

function readBuffered() {
  const video = videoRef.value
  if (!video || video.buffered.length === 0) {
    buffered.value = 0
    return
  }
  buffered.value = video.buffered.end(video.buffered.length - 1)
}

function saveProgress(force = false) {
  if (!import.meta.client) return
  const video = videoRef.value
  if (!video) return
  const now = Date.now()
  if (!force && now - lastSavedAt < SAVE_INTERVAL_MS) return
  lastSavedAt = now
  try {
    localStorage.setItem(storageKey.value, JSON.stringify({ t: video.currentTime }))
  } catch {
    // 隐身模式 / 存储已满：记不住进度不影响观看
  }
}

function onLoadedMetadata() {
  const video = videoRef.value
  if (!video) return
  duration.value = video.duration
  video.playbackRate = rate.value
  readBuffered()
  if (!import.meta.client) return
  const saved = parseStoredProgress(localStorage.getItem(storageKey.value))
  resumeAt.value = saved === null ? 0 : resumePosition(saved, video.duration)
}

function onTimeUpdate() {
  const video = videoRef.value
  if (!video) return
  currentTime.value = video.currentTime
  readBuffered()
  saveProgress()
}

function onPlay() {
  playing.value = true
  started.value = true
  waiting.value = false
  revealControls()
}

function onPause() {
  playing.value = false
  waiting.value = false
  controlsVisible.value = true
  clearHideTimer()
  saveProgress(true)
}

function onPlaying() {
  playing.value = true
  started.value = true
  waiting.value = false
}

function onEnded() {
  playing.value = false
  controlsVisible.value = true
  clearHideTimer()
  saveProgress(true)
}

function onVolumeSlider(event: Event) {
  setVolume(Number((event.target as HTMLInputElement).value))
}

function onRateSelect(event: Event) {
  const video = videoRef.value
  if (!video) return
  const next = Number((event.target as HTMLSelectElement).value)
  video.playbackRate = next
  rate.value = next
}

function onVolumeChange() {
  const video = videoRef.value
  if (!video) return
  volume.value = video.volume
  muted.value = video.muted
}

function onKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const key = event.key
  if (key === ' ' || key === 'k' || key === 'K') {
    event.preventDefault()
    void togglePlay()
  } else if (key === 'ArrowLeft') {
    event.preventDefault()
    seekBy(-SEEK_STEP_SECONDS)
  } else if (key === 'ArrowRight') {
    event.preventDefault()
    seekBy(SEEK_STEP_SECONDS)
  } else if (key === 'ArrowUp') {
    event.preventDefault()
    changeVolume(VOLUME_STEP)
  } else if (key === 'ArrowDown') {
    event.preventDefault()
    changeVolume(-VOLUME_STEP)
  } else if (key === 'm' || key === 'M') {
    event.preventDefault()
    toggleMute()
  } else if (key === 'f' || key === 'F') {
    event.preventDefault()
    toggleFullscreen()
  } else {
    return
  }
  revealControls()
}

function onFocusIn() {
  focusWithin.value = true
  revealControls()
}

function onFocusOut(event: FocusEvent) {
  const root = rootRef.value
  if (root && event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
  focusWithin.value = false
  revealControls()
}

function onFullscreenChange() {
  if (!import.meta.client) return
  fullscreen.value = document.fullscreenElement === rootRef.value
}

function onBeforeUnload() {
  saveProgress(true)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('beforeunload', onBeforeUnload)
  clearHideTimer()
  saveProgress(true)
})
</script>

<template>
  <div
    ref="rootRef"
    class="group relative aspect-video w-full select-none overflow-hidden bg-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    tabindex="0"
    role="region"
    :aria-label="regionLabel"
    @mousemove="revealControls"
    @mouseleave="hideControlsOnLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <video
      ref="videoRef"
      class="absolute inset-0 h-full w-full bg-slate-950 object-contain"
      :src="src"
      :poster="poster ?? undefined"
      :aria-label="title ?? regionLabel"
      playsinline
      preload="metadata"
      @click="togglePlay"
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @progress="readBuffered"
      @play="onPlay"
      @pause="onPause"
      @playing="onPlaying"
      @waiting="waiting = true"
      @canplay="waiting = false"
      @ended="onEnded"
      @volumechange="onVolumeChange"
      @error="failed = true"
    />

    <!-- 未开播时居中的大播放键；开播后交给底部控制条 -->
    <button
      v-if="!started && !failed && !hasResume"
      type="button"
      class="absolute inset-0 grid place-items-center"
      :aria-label="playLabel"
      @click="togglePlay"
    >
      <span
        class="grid h-16 w-16 place-items-center rounded-full bg-slate-900/70 text-white backdrop-blur hover:bg-slate-900/85"
      >
        <Play class="ml-0.5 h-7 w-7" />
      </span>
    </button>

    <div
      v-if="hasResume"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/70 px-4 text-center"
    >
      <p class="text-sm text-white/80">{{ resumeCaption }}</p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600"
          @click="resumePlay"
        >
          <Play class="h-4 w-4" />
          {{ resumeLabel }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
          @click="restartFromStart"
        >
          <RotateCcw class="h-4 w-4" />
          {{ t('player.resumeRestart') }}
        </button>
      </div>
    </div>

    <div
      v-if="waiting && !failed"
      class="pointer-events-none absolute inset-0 grid place-items-center"
    >
      <span
        class="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
        role="status"
        :aria-label="t('player.loading')"
      />
    </div>

    <div
      v-if="failed"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-4 text-center"
    >
      <p class="text-sm text-white/85">{{ t('player.error') }}</p>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
        @click="reload"
      >
        <RotateCcw class="h-4 w-4" />
        {{ t('player.retry') }}
      </button>
    </div>

    <!-- 控制条：仅在悬停 / 聚焦时出现，播放中 2.5s 无操作淡出 -->
    <div
      class="absolute inset-x-0 bottom-0 bg-slate-900/80 px-3 pb-2 pt-2.5 backdrop-blur transition-opacity duration-200"
      :class="showBar ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <div
        ref="barRef"
        class="group/track relative h-1 w-full cursor-pointer rounded-full bg-slate-500/40 hover:h-1.5"
        role="slider"
        tabindex="0"
        :aria-label="t('player.progress')"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(duration)"
        :aria-valuenow="Math.round(currentTime)"
        :aria-valuetext="timeLabel"
        @pointerdown="onBarPointerDown"
        @pointermove="onBarPointerMove"
        @pointerup="onBarPointerUp"
        @pointercancel="onBarPointerUp"
      >
        <div
          class="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-slate-500"
          :style="{ width: bufferedPercent }"
        />
        <div
          class="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-brand-500"
          :style="{ width: playedPercent }"
        />
        <span
          class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow opacity-0 group-hover/track:opacity-100"
          :class="dragging ? 'opacity-100' : ''"
          :style="{ left: playedPercent }"
        />
      </div>

      <div class="mt-2 flex items-center gap-1.5 text-white/90">
        <button
          type="button"
          class="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10"
          :aria-label="playLabel"
          @click="togglePlay"
        >
          <Pause v-if="playing" class="h-4 w-4" />
          <Play v-else class="h-4 w-4" />
        </button>

        <span class="text-xs tabular-nums text-white/80">{{ timeLabel }}</span>

        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10"
            :aria-label="muteLabel"
            @click="toggleMute"
          >
            <component :is="VolumeIcon" class="h-4 w-4" />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="muted ? 0 : volume"
            :aria-label="t('player.volume')"
            class="hidden h-1 w-20 cursor-pointer accent-brand-500 sm:block"
            @input="onVolumeSlider"
          />
          <select
            :value="String(rate)"
            :aria-label="t('player.speed')"
            class="cursor-pointer rounded bg-transparent px-1 py-1 text-xs tabular-nums text-white/80 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            @change="onRateSelect"
          >
            <option
              v-for="speed in SPEEDS"
              :key="speed"
              :value="String(speed)"
              class="text-slate-900"
            >
              {{ speed }}×
            </option>
          </select>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10"
            :aria-label="fullscreenLabel"
            @click="toggleFullscreen"
          >
            <Minimize v-if="fullscreen" class="h-4 w-4" />
            <Maximize v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
