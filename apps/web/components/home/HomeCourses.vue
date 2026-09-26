<script setup lang="ts">
import { GraduationCap } from 'lucide-vue-next'
import type { CourseCategoryDTO, CourseListItem, Paginated } from '@devshare/shared'

// 首页课程区每批 6 门（3×2 网格），与接口默认 limit 一致
const PAGE_SIZE = 6

const props = defineProps<{ categories: CourseCategoryDTO[] }>()
// 与右栏「热门方向」共享同一个选中分类；null = 「推荐」（全部课程）
const activeTag = defineModel<string | null>({ default: null })

const { t } = useI18n()
const api = useApi()

const courses = ref<CourseListItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
let requestSeq = 0

// SSR 首屏直接出推荐课程，避免首屏空白
const { data: firstPage } = await useAsyncData('home-courses', () =>
  api.get<Paginated<CourseListItem>>('/courses', { query: { limit: PAGE_SIZE } }),
)
courses.value = firstPage.value?.items ?? []
cursor.value = firstPage.value?.nextCursor ?? null

const tabs = computed(() => [
  { key: '', label: t('course.all') },
  ...props.categories.map((category) => ({ key: category.slug, label: category.name })),
])

async function fetchFirstPage() {
  const seq = ++requestSeq
  loading.value = true
  courses.value = []
  cursor.value = null
  try {
    const res = await api.get<Paginated<CourseListItem>>('/courses', {
      query: { tag: activeTag.value ?? undefined, limit: PAGE_SIZE },
    })
    if (seq !== requestSeq) return
    courses.value = res.items
    cursor.value = res.nextCursor
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !cursor.value) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const res = await api.get<Paginated<CourseListItem>>('/courses', {
      query: {
        tag: activeTag.value ?? undefined,
        cursor: cursor.value,
        limit: PAGE_SIZE,
      },
    })
    if (seq !== requestSeq) return
    courses.value.push(...res.items)
    cursor.value = res.nextCursor
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

// 切分类重置游标重新拉；SSR 首屏已经渲染过推荐，只有用户点击才需要重取
watch(activeTag, fetchFirstPage)

function selectTab(key: string) {
  activeTag.value = key || null
}
</script>

<template>
  <section class="bg-white rounded-2xl border border-slate-200 px-3 sm:px-4 pt-4 pb-5 shadow-sm">
    <div class="flex items-center gap-2">
      <GraduationCap class="w-4 h-4 text-brand-500" />
      <h2 class="font-semibold text-slate-900">{{ t('home.courses') }}</h2>
    </div>

    <div class="flex items-center gap-2 overflow-x-auto py-3">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="shrink-0 rounded-full px-3 py-1 text-sm transition-colors"
        :class="
          (activeTag ?? '') === tab.key
            ? 'bg-brand-500 text-white font-medium'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        "
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <BaseSkeleton v-for="i in PAGE_SIZE" :key="i" class="h-60 rounded-xl" />
    </div>

    <div
      v-else-if="courses.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <CourseCard v-for="course in courses" :key="course.id" :course="course" />
    </div>

    <BaseEmpty v-else :text="t('course.empty')" />

    <div v-if="!loading && cursor" class="mt-4 flex justify-center">
      <BaseButton variant="secondary" @click="loadMore">
        {{ t('home.loadMore') }}
      </BaseButton>
    </div>
  </section>
</template>
