<script setup lang="ts">
import { ArrowUp, Hash, Users } from 'lucide-vue-next'
import {
  DEFAULT_TAGS,
  type ArticleListItem,
  type AuthorInfo,
  type CourseCategoryDTO,
  type Paginated,
  type RankItem,
  type TagDTO,
} from '@devshare/shared'

const { t } = useI18n()
const api = useApi()

// ---------------- 信息流状态 ----------------
const sort = ref<'latest' | 'hot'>('latest')
const activeTag = ref<string | null>(null)
const items = ref<ArticleListItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const endReached = ref(false)
let requestSeq = 0

// ---------------- SSR 首屏数据 ----------------
const { data: firstPage, pending: initialPending } = await useAsyncData('home-feed', () =>
  api.get<Paginated<ArticleListItem>>('/articles', { query: { sort: 'latest', limit: 20 } }),
)
const { data: rank } = await useAsyncData('home-rank', () =>
  api.get<RankItem[]>('/rank/hot', { query: { limit: 10 } }),
)
const { data: tags } = await useAsyncData('home-tags', () => api.get<TagDTO[]>('/tags'))
const { data: courseCategories } = await useAsyncData('home-course-categories', () =>
  api.get<CourseCategoryDTO[]>('/courses/categories'),
)

// 课程板块的分类筛选：左栏 tab 与右栏「热门方向」共享，null = 推荐（全部课程）
const activeCourseCategory = ref<string | null>(null)

items.value = firstPage.value?.items ?? []
cursor.value = firstPage.value?.nextCursor ?? null

// ---------------- 派生数据 ----------------
// 焦点轮播：优先取热门榜前 4，热门榜为空时回退到信息流里阅读量最高的文章
const featured = computed<ArticleListItem[]>(() => {
  const fromRank = (rank.value ?? []).map((r) => r.article)
  if (fromRank.length > 0) return fromRank.slice(0, 4)
  return [...items.value].sort((a, b) => b.viewCount - a.viewCount).slice(0, 4)
})

// 频道条：按品牌预设顺序展示标签，而不是接口顺序
const channels = computed(() => {
  const order = new Map<string, number>(DEFAULT_TAGS.map((tag, index) => [tag.slug, index]))
  return [...(tags.value ?? [])].sort(
    (a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99),
  )
})

// 推荐作者：从信息流 + 热门榜里聚合作者（文章数 + 总阅读）
interface AuthorStat {
  author: AuthorInfo
  articleCount: number
  viewCount: number
}

const topAuthors = computed<AuthorStat[]>(() => {
  const map = new Map<number, AuthorStat>()
  const merge = (article: ArticleListItem) => {
    const stat = map.get(article.author.id)
    if (stat) {
      stat.articleCount += 1
      stat.viewCount += article.viewCount
    } else {
      map.set(article.author.id, {
        author: article.author,
        articleCount: 1,
        viewCount: article.viewCount,
      })
    }
  }
  items.value.forEach(merge)
  ;(rank.value ?? []).forEach((r) => merge(r.article))
  return [...map.values()].sort((a, b) => b.viewCount - a.viewCount).slice(0, 5)
})

// ---------------- 信息流请求 ----------------
async function fetchFirstPage() {
  const seq = ++requestSeq
  loading.value = true
  endReached.value = false
  try {
    const res = await api.get<Paginated<ArticleListItem>>('/articles', {
      query: {
        sort: sort.value,
        tag: activeTag.value ?? undefined,
        limit: 20,
      },
    })
    if (seq !== requestSeq) return
    items.value = res.items
    cursor.value = res.nextCursor
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

async function loadMore() {
  if (loading.value || endReached.value) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const res = await api.get<Paginated<ArticleListItem>>('/articles', {
      query: {
        sort: sort.value,
        tag: activeTag.value ?? undefined,
        cursor: cursor.value ?? undefined,
        limit: 20,
      },
    })
    if (seq !== requestSeq) return
    items.value.push(...res.items)
    cursor.value = res.nextCursor
    if (!res.nextCursor) endReached.value = true
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function selectChannel(slug: string | null) {
  activeTag.value = slug
}

watch([sort, activeTag], fetchFirstPage)

// ---------------- 回到顶部 ----------------
const showBackTop = ref(false)
function onScroll() {
  showBackTop.value = window.scrollY > 600
}
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

useHead({
  title: 'DevShare（技享）',
  meta: [{ name: 'description', content: t('brand.slogan') }],
})
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
    <!-- 主栏 -->
    <div class="flex flex-col gap-5 min-w-0">
      <HomeFocus :articles="featured" />

      <HomeCourses v-model="activeCourseCategory" :categories="courseCategories ?? []" />

      <section
        class="bg-white rounded-2xl border border-slate-200 px-3 sm:px-4 pt-3 pb-4 shadow-sm"
      >
        <div class="flex items-center justify-between gap-3">
          <BaseTabs
            v-model="sort"
            class="flex-1 min-w-0"
            :tabs="[
              { key: 'latest', label: t('home.feed') },
              { key: 'hot', label: t('home.hot') },
            ]"
          />
          <BaseSpinner
            v-if="loading && items.length > 0"
            size="sm"
            class="text-brand-500 shrink-0"
          />
        </div>

        <!-- 频道快捷筛选（类 CSDN 频道条） -->
        <div
          class="flex items-center gap-2 overflow-x-auto py-3 border-b border-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            class="shrink-0 rounded-full px-3 py-1 text-sm transition-colors"
            :class="
              activeTag === null
                ? 'bg-brand-500 text-white font-medium'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            "
            @click="selectChannel(null)"
          >
            {{ t('home.all') }}
          </button>
          <button
            v-for="channel in channels"
            :key="channel.slug"
            class="shrink-0 rounded-full px-3 py-1 text-sm transition-colors"
            :class="
              activeTag === channel.slug
                ? 'bg-brand-500 text-white font-medium'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            "
            @click="selectChannel(channel.slug)"
          >
            {{ channel.name }}
          </button>
        </div>

        <div class="mt-3">
          <div v-if="initialPending && items.length === 0" class="flex flex-col gap-3">
            <BaseSkeleton v-for="i in 5" :key="i" class="h-40 rounded-xl" />
          </div>

          <VirtualFeed
            v-else-if="items.length > 0"
            :items="items"
            :loading="loading"
            :end-reached="loadMore"
          >
            <template #item="{ item }">
              <ArticleCard :article="item as ArticleListItem" />
            </template>
          </VirtualFeed>

          <BaseEmpty v-else :text="t('home.empty')" />
        </div>
      </section>
    </div>

    <!-- 右侧栏 -->
    <aside class="hidden lg:flex flex-col gap-5 sticky top-20">
      <HomeCreateCard />

      <HomeCourseCategories v-model="activeCourseCategory" :categories="courseCategories ?? []" />

      <HotRank :items="rank ?? []" />

      <section class="bg-white rounded-xl border border-slate-200 p-4">
        <h2 class="flex items-center gap-2 font-semibold text-slate-900 mb-2">
          <Users class="w-4 h-4 text-brand-500" />
          <span>{{ t('home.recAuthors') }}</span>
        </h2>
        <HomeAuthorList :authors="topAuthors" />
      </section>

      <section class="bg-white rounded-xl border border-slate-200 p-4">
        <h2 class="flex items-center gap-2 font-semibold text-slate-900 mb-3">
          <Hash class="w-4 h-4 text-accent-500" />
          <span>{{ t('home.hotTags') }}</span>
        </h2>
        <HomeTagCloud :tags="tags ?? []" :max="18" />
      </section>
    </aside>

    <button
      v-if="showBackTop"
      class="fixed bottom-6 right-6 z-40 w-10 h-10 grid place-items-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 transition-all"
      :aria-label="t('home.backTop')"
      @click="backToTop"
    >
      <ArrowUp class="w-5 h-5" />
    </button>
  </div>
</template>
