<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'

// 通用虚拟表格：表头由父组件用 #head 传入，行由 #row 渲染（组件负责 <tr> 的高度与 hover），
// 列表为空时用 #empty 渲染一行（组件负责包 <tr>，调用方只给 <td>），滚动到列表末尾附近时回调
// endReached，交给父组件决定要不要追加下一页。
// 与 VirtualFeed 同一套 SSR 处理：未挂载时静态渲染前 12 行，客户端激活后再切成真虚拟滚动。
//
// 两条硬约束，改了会出可视化 bug：
// 1）行必须严格等高 —— 单元格内容要单行或至多两行截断，撑破 rowHeight 会导致相邻行重叠；
// 2）表格用 border-separate —— 粘性表头在 border-collapse 下边框会随内容滚走，
//    所以分隔线要写在 <td> 上（border-t），<tr> 的边框在 border-separate 下根本不渲染；
//    调用方的 <th> 也得自己带 sticky top-0 z-10 与不透明背景，否则滚动时会被行盖住。
const props = withDefaults(
  defineProps<{
    items: unknown[]
    // spacer 行的 colspan，必须等于表格列数
    columns: number
    rowHeight?: number
    maxHeight?: string
    tableClass?: string
    overscan?: number
    loading?: boolean
    endReached?: () => void
  }>(),
  {
    rowHeight: 68,
    maxHeight: 'calc(100vh - 260px)',
    tableClass: '',
    overscan: 8,
    loading: false,
  },
)

const parentRef = ref<HTMLElement | null>(null)

// SSR 阶段拿不到真实滚动容器、算不出虚拟尺寸，先静态渲染前 12 行，
// onMounted 之后再切虚拟滚动，避免服务端与客户端首帧渲染不一致。
const hydrated = ref(false)

onMounted(() => {
  hydrated.value = true
})

// 选项必须由 computed 提供：useVirtualizer 只在 options 这个响应式源变化时才
// setOptions + triggerRef(state)，而直接调用实例的 setOptions 不会触发它自己的
// onChange（它的 maybeNotify 只在可视区间变化时才通知）。走 computed 后，items
// 一变就会重建选项并 triggerRef，virtualRows / totalSize 这些依赖 state 的 computed
// 才会失效重算 —— 否则表格会一直渲染旧的那几行（新数据 / 触底加载都表现成「没生效」）。
const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.rowHeight,
    overscan: props.overscan,
  })),
)

watch(
  () => props.rowHeight,
  () => virtualizer.value?.measure(),
)

// 触底判定与 VirtualFeed 一致：可视区最后一个条目的 index 距列表末尾不足 5 条时通知父组件
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

const virtualRows = computed(() => virtualizer.value?.getVirtualItems() ?? [])
const totalSize = computed(() => virtualizer.value?.getTotalSize() ?? 0)
// 上下各一行 spacer 撑出未渲染条目的高度，真正渲染的只有可视窗口内那几条
const paddingTop = computed(() => virtualRows.value[0]?.start ?? 0)
const paddingBottom = computed(() => {
  const last = virtualRows.value[virtualRows.value.length - 1]
  return last ? Math.max(totalSize.value - last.end, 0) : 0
})

function scrollToTop() {
  parentRef.value?.scrollTo({ top: 0 })
}

defineExpose({ scrollToTop })
</script>

<template>
  <div ref="parentRef" class="overflow-auto" :style="{ maxHeight }">
    <table class="w-full text-sm border-separate border-spacing-0" :class="tableClass">
      <thead class="text-slate-500">
        <tr>
          <slot name="head" />
        </tr>
      </thead>
      <tbody>
        <!-- 未挂载/SSR：静态渲染前 12 行 -->
        <template v-if="!hydrated">
          <tr
            v-for="(item, index) in items.slice(0, 12)"
            :key="index"
            :style="{ height: rowHeight + 'px' }"
            class="hover:bg-slate-50"
          >
            <slot name="row" :item="item" :index="index" />
          </tr>
        </template>

        <template v-else-if="items.length === 0">
          <tr>
            <slot name="empty" />
          </tr>
        </template>

        <template v-else>
          <tr v-if="paddingTop > 0" aria-hidden="true" :style="{ height: paddingTop + 'px' }">
            <td :colspan="columns" class="p-0" />
          </tr>
          <tr
            v-for="row in virtualRows"
            :key="String(row.key)"
            :style="{ height: rowHeight + 'px' }"
            class="hover:bg-slate-50"
          >
            <slot name="row" :item="items[row.index]" :index="row.index" />
          </tr>
          <tr v-if="paddingBottom > 0" aria-hidden="true" :style="{ height: paddingBottom + 'px' }">
            <td :colspan="columns" class="p-0" />
          </tr>
        </template>

        <tr v-if="loading">
          <td :colspan="columns" class="py-4 text-center">
            <BaseSpinner size="sm" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
