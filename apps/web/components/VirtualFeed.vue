<script setup lang="ts">
import { useVirtualizer, type VirtualizerOptions } from '@tanstack/vue-virtual'

// items 由父组件（pages/index.vue）注入：首屏数据来自 SSR 阶段 useAsyncData 的请求结果，
// 且 nuxt.config 关闭了 payloadExtraction，数据直接内联进 HTML。
// 因此客户端激活后直接用这份数据渲染首屏，不会再向 /api 发一次首屏请求；
// 只有切换 tab（fetchFirstPage）或滚动触底（loadMore）时父组件才会新发请求。
const props = withDefaults(
  defineProps<{
    items: unknown[]
    itemHeight?: number
    overscan?: number
    loading?: boolean
    endReached?: () => void
  }>(),
  {
    // 卡片主体高度；虚拟行距（pb-3 = 12px）由组件内部统一加上
    itemHeight: 160,
    overscan: 8,
    loading: false,
  },
)

const itemSize = computed(() => props.itemHeight + 12)

const parentRef = ref<HTMLElement | null>(null)

// hydrated 用于区分「SSR/首屏」与「客户端激活后」两种渲染形态：
// - 服务端渲染阶段拿不到真实滚动容器，无法计算虚拟列表尺寸，若首屏就走虚拟滚动，
//   会导致客户端/服务端渲染不一致（即本仓库之前修的水合问题）。
// - 因此 SSR 先静态渲染前 items.slice(0, 12) 条（首屏 HTML 自带内容，利于 SEO）；
//   onMounted 后才置为 true，切换成真正的虚拟滚动，仅渲染可视窗口内的条目。
const hydrated = ref(false)

onMounted(() => {
  hydrated.value = true
})

const virtualizer = useVirtualizer({
  count: props.items.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => itemSize.value,
  overscan: props.overscan,
})

watch(
  () => props.items.length,
  (count) => {
    virtualizer.value?.setOptions({
      count,
      getScrollElement: () => parentRef.value,
      estimateSize: () => itemSize.value,
      overscan: props.overscan,
    } as unknown as VirtualizerOptions<HTMLElement, Element>)
  },
)

watch(itemSize, () => virtualizer.value?.measure())

// 滚动触底判定：当可视区最后一个条目的 index 距列表末尾不足 5 条时，
// 通知父组件触发 loadMore（请求 /articles?cursor=… 追加下一页，直到 nextCursor 为空）。
watch(
  () => (virtualizer.value?.getVirtualItems() ?? []).map((v) => v.index),
  (indices) => {
    const lastIndex = indices[indices.length - 1]
    if (lastIndex !== undefined && lastIndex >= props.items.length - 5) {
      props.endReached?.()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <div>
    <!-- SSR/首屏：数据来自内联 HTML，静态渲染前 12 条，不发接口 -->
    <div v-if="!hydrated" class="flex flex-col gap-3">
      <slot
        v-for="(item, index) in items.slice(0, 12)"
        :key="index"
        name="item"
        :item="item"
        :index="index"
      />
    </div>

    <!-- 客户端激活后：切换为虚拟滚动，仅渲染可视窗口条目；滚动触底才触发父组件 loadMore -->
    <!-- 高度只卡 maxHeight、由内容撑开：条目不足一屏时容器跟着内容收，不留大片空白 -->
    <div v-else ref="parentRef" class="overflow-auto" :style="{ maxHeight: 'calc(100vh - 240px)' }">
      <div class="relative" :style="{ height: virtualizer.getTotalSize() + 'px' }">
        <div
          v-for="item in virtualizer.getVirtualItems()"
          :key="String(item.key)"
          class="absolute top-0 left-0 w-full"
          :style="{ transform: `translateY(${item.start}px)` }"
        >
          <div class="px-0.5 pb-3">
            <slot name="item" :item="items[item.index]" :index="item.index" />
          </div>
        </div>
      </div>
      <div v-if="loading" class="flex justify-center py-4">
        <BaseSpinner size="sm" />
      </div>
    </div>
  </div>
</template>
