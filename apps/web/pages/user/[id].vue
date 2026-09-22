<script setup lang="ts">
import type { ArticleListItem, CourseListItem, Paginated, UserProfile } from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const { t, locale } = useI18n()
const api = useApi()
const auth = useAuthStore()

const userId = computed(() => Number(route.params.id))
const tab = ref<'articles' | 'collects' | 'courses'>('articles')
const articles = ref<ArticleListItem[]>([])
const courses = ref<CourseListItem[]>([])
const loading = ref(false)

// 报名记录属于隐私数据，只有本人能看到「课程」tab（与 GET /users/:id/courses 的权限一致）
const isSelf = computed(() => !!auth.user && auth.user.id === userId.value)

const tabs = computed(() => {
  const list = [
    { key: 'articles', label: t('user.articles') },
    { key: 'collects', label: t('user.collects') },
  ]
  if (isSelf.value) list.push({ key: 'courses', label: t('user.courses') })
  return list
})

const { data: profile, pending } = await useAsyncData(
  `user-${userId.value}`,
  () => api.get<UserProfile>(`/users/${userId.value}`),
  // 同 article/[id].vue：默认 shallowRef 下改 profile.followedByMe / followerCount 不会触发更新。
  { deep: true },
)

async function loadList() {
  loading.value = true
  try {
    if (tab.value === 'courses') {
      const res = await api.get<Paginated<CourseListItem>>(`/users/${userId.value}/courses`, {
        query: { limit: 12 },
      })
      courses.value = res.items
    } else if (tab.value === 'articles') {
      const res = await api.get<Paginated<ArticleListItem>>(`/users/${userId.value}/articles`, {
        query: { limit: 20 },
      })
      articles.value = res.items
    } else {
      const res = await api.get<Paginated<ArticleListItem>>(`/users/${userId.value}/collects`)
      articles.value = res.items
    }
  } finally {
    loading.value = false
  }
}

watch(tab, loadList, { immediate: true })

async function toggleFollow() {
  if (!profile.value) return
  const res = await api.post<{ followed: boolean }>(`/users/${userId.value}/follow`)
  profile.value.followedByMe = res.followed
  profile.value.followerCount += res.followed ? 1 : -1
}

useHead(() => ({ title: `${profile.value?.username ?? ''} - DevShare` }))
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div v-if="pending" class="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
      <div class="flex items-center gap-4">
        <BaseSkeleton class="w-16 h-16 rounded-full" />
        <BaseSkeleton class="h-6 w-40" />
      </div>
      <BaseSkeleton class="h-4 w-72" />
    </div>

    <div v-else-if="profile" class="bg-white rounded-xl border border-slate-200 p-6 mb-5">
      <div class="flex items-start gap-4">
        <BaseAvatar :src="profile.avatar" :name="profile.username" size="lg" />
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-slate-900">{{ profile.username }}</h1>
          <p class="text-sm text-slate-500 mt-1">{{ profile.bio ?? t('user.bio') }}</p>
          <p class="text-xs text-slate-400 mt-1">
            {{ t('user.joined') }}:
            {{
              new Date(profile.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')
            }}
          </p>
          <div class="flex items-center gap-5 mt-3 text-sm text-slate-600">
            <span
              ><strong class="text-slate-900">{{ profile.articleCount }}</strong>
              {{ t('user.articles') }}</span
            >
            <span
              ><strong class="text-slate-900">{{ profile.followerCount }}</strong>
              {{ t('user.followers') }}</span
            >
            <span
              ><strong class="text-slate-900">{{ profile.followingCount }}</strong>
              {{ t('user.following') }}</span
            >
          </div>
        </div>
        <BaseButton
          v-if="auth.isLoggedIn && auth.user?.id !== userId"
          :variant="profile.followedByMe ? 'secondary' : 'primary'"
          size="sm"
          @click="toggleFollow"
        >
          {{ profile.followedByMe ? t('article.following') : t('article.follow') }}
        </BaseButton>
      </div>
    </div>

    <BaseTabs v-model="tab" :tabs="tabs" class="mb-4" />

    <div class="bg-white rounded-xl border border-slate-200 p-4">
      <div v-if="loading" class="flex flex-col gap-3">
        <BaseSkeleton v-for="i in 4" :key="i" class="h-28 rounded-xl" />
      </div>
      <div v-else-if="tab === 'courses'">
        <div v-if="courses.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CourseCard v-for="course in courses" :key="course.id" :course="course" />
        </div>
        <BaseEmpty v-else :text="t('user.noCourses')" />
      </div>
      <div v-else-if="articles.length > 0" class="flex flex-col gap-3">
        <ArticleCard v-for="article in articles" :key="article.id" :article="article" />
      </div>
      <BaseEmpty v-else :text="tab === 'articles' ? t('user.noArticles') : t('user.noCollects')" />
    </div>
  </div>
</template>
