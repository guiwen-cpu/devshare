<script setup lang="ts">
import { Eye, Heart, MessageSquare, Pencil, Send, Star, Trash2, X, ZoomIn } from 'lucide-vue-next'
import type { ArticleDetail, CommentItem, Paginated } from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { formatCount, timeAgo } from '~/utils/format'
import { useNow } from '~/composables/useNow'
import { useHydrated } from '~/composables/useHydrated'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const localePath = useLocalePath()
const now = useNow()
const hydrated = useHydrated()

const articleId = computed(() => Number(route.params.id))

const {
  data: article,
  pending,
  refresh,
} = await useAsyncData(`article-${articleId.value}`, () =>
  api.get<ArticleDetail>(`/articles/${articleId.value}`),
)
const { data: commentsPage } = await useAsyncData(`comments-${articleId.value}`, () =>
  api.get<Paginated<CommentItem>>(`/articles/${articleId.value}/comments`, {
    query: { limit: 30 },
  }),
)

const comments = ref<CommentItem[]>(commentsPage.value?.items ?? [])
const commentText = ref('')
const submitting = ref(false)
const following = ref(false)

// 封面图灯箱：点击封面弹大图，Esc / 点遮罩 / 点关闭按钮均可关闭
const coverPreviewOpen = ref(false)

function closeCoverPreview() {
  coverPreviewOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCoverPreview()
}

// 弹窗打开时锁定背景滚动，避免底层页面跟着滚
watch(coverPreviewOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

async function toggleLike() {
  if (!auth.isLoggedIn) {
    toast.info(t('errors.UNAUTHORIZED'))
    return
  }
  await api.post<{ liked: boolean; likeCount: number }>(`/articles/${articleId.value}/like`)
  // if (article.value) {
  //   article.value.likedByMe = res.liked
  //   article.value.likeCount = res.likeCount
  // }
  refresh()
}

async function toggleCollect() {
  if (!auth.isLoggedIn) {
    toast.info(t('errors.UNAUTHORIZED'))
    return
  }
  await api.post<{ collected: boolean; collectCount: number }>(
    `/articles/${articleId.value}/collect`,
  )
  refresh()
  // if (article.value) {
  //   article.value.collectedByMe = res.collected
  //   article.value.collectCount = res.collectCount
  // }
}

async function toggleFollow() {
  if (!auth.isLoggedIn) {
    toast.info(t('errors.UNAUTHORIZED'))
    return
  }
  if (!article.value) return
  const res = await api.post<{ followed: boolean }>(`/users/${article.value.author.id}/follow`)
  following.value = res.followed
}

async function submitComment() {
  const content = commentText.value.trim()
  if (!content || !article.value) return
  submitting.value = true
  try {
    const comment = await api.post<CommentItem>(`/articles/${articleId.value}/comments`, {
      content,
    })
    comments.value.unshift(comment)
    commentText.value = ''
    article.value.commentCount += 1
  } finally {
    submitting.value = false
  }
}

async function deleteComment(comment: CommentItem) {
  await api.del(`/articles/${articleId.value}/comments/${comment.id}`)
  comments.value = comments.value.filter((c) => c.id !== comment.id)
  if (article.value) article.value.commentCount = Math.max(0, article.value.commentCount - 1)
  toast.success(t('article.deleteSuccess'))
}

const deleting = ref(false)

// 作者本人或管理员可管理这篇文章（与后端 PATCH/DELETE /articles/:id 的判定一致）。
// 用 hydrated 兜住：登录态来自 localStorage，首帧必须等服务端/客户端对齐后再渲染。
const canManage = computed(
  () =>
    !!article.value &&
    !!auth.user &&
    (article.value.author.id === auth.user.id || auth.user.role === 'admin'),
)

function goEdit() {
  router.push(localePath(`/write/${articleId.value}`))
}

async function removeArticle() {
  if (!article.value) return
  if (!window.confirm(t('article.confirmDelete', { title: article.value.title }))) return
  deleting.value = true
  try {
    await api.del(`/articles/${articleId.value}`)
    toast.success(t('article.deleteSuccess'))
    await router.push(localePath('/'))
  } catch {
    /* useApi already toasts the error */
  } finally {
    deleting.value = false
  }
}

useHead(() => ({
  title: article.value ? `${article.value.title} - DevShare` : 'DevShare',
  meta: [
    {
      name: 'description',
      content: article.value?.summary ?? '',
    },
  ],
}))
</script>

<template>
  <div v-if="pending" class="flex flex-col gap-4">
    <BaseSkeleton class="h-8 w-2/3" />
    <BaseSkeleton class="h-4 w-1/3" />
    <BaseSkeleton class="h-96" />
  </div>

  <div v-else-if="article" class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
    <article class="bg-white rounded-xl border border-slate-200 p-6 sm:p-8">
      <div class="flex justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
        <div>
          <div class="flex items-center gap-2 mb-3">
            <BaseTag v-for="tag in article.tags" :key="tag.id" :name="tag.name" :slug="tag.slug" />
          </div>

          <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 leading-snug mb-4">
            {{ article.title }}
          </h1>

          <div class="flex flex-wrap items-center gap-3">
            <NuxtLink
              :to="localePath(`/user/${article.author.id}`)"
              class="flex items-center gap-2"
            >
              <BaseAvatar :src="article.author.avatar" :name="article.author.username" size="sm" />
              <span class="text-sm font-medium text-slate-700 hover:text-brand-600">
                {{ article.author.username }}
              </span>
            </NuxtLink>
            <span class="text-xs text-slate-400">{{
              timeAgo(article.publishedAt, locale, now)
            }}</span>
            <span class="text-xs text-slate-400 flex items-center gap-1">
              <Eye class="w-3.5 h-3.5" /> {{ formatCount(article.viewCount) }}
            </span>
            <BaseButton
              size="sm"
              variant="secondary"
              :class="{ 'text-brand-600': following }"
              @click="toggleFollow"
            >
              {{ following ? t('article.following') : t('article.follow') }}
            </BaseButton>
            <template v-if="hydrated && canManage">
              <BaseButton size="sm" variant="secondary" @click="goEdit">
                <Pencil class="w-3.5 h-3.5" /> {{ t('article.edit') }}
              </BaseButton>
              <BaseButton
                size="sm"
                variant="secondary"
                class="text-red-500"
                :loading="deleting"
                @click="removeArticle"
              >
                <Trash2 class="w-3.5 h-3.5" /> {{ t('article.delete') }}
              </BaseButton>
            </template>
          </div>
        </div>
        <div v-if="article.cover" class="w-40 shrink-0">
          <button
            type="button"
            class="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            :title="t('article.viewCover')"
            :aria-label="t('article.viewCover')"
            @click="coverPreviewOpen = true"
          >
            <img
              :src="article.cover"
              :alt="article.title"
              class="w-full transition duration-300 group-hover:scale-105"
            />
            <span
              class="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition duration-300 group-hover:bg-slate-900/40 group-hover:opacity-100"
            >
              <ZoomIn class="h-7 w-7 drop-shadow" />
            </span>
          </button>
        </div>
      </div>

      <!-- contentHtml 已由后端 markdown 渲染后经 xss 白名单清洗，见 apps/api/src/articles/markdown.util.ts -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="prose-content" v-html="article.contentHtml" />

      <div class="flex items-center justify-center gap-3 mt-8 pt-6 border-t border-slate-100">
        <BaseButton :variant="article.likedByMe ? 'primary' : 'secondary'" @click="toggleLike">
          <Heart class="w-4 h-4" :fill="article.likedByMe ? 'currentColor' : 'none'" />
          {{ article.likedByMe ? t('article.liked') : t('article.like') }} ·
          {{ formatCount(article.likeCount) }}
        </BaseButton>
        <BaseButton
          :variant="article.collectedByMe ? 'primary' : 'secondary'"
          @click="toggleCollect"
        >
          <Star class="w-4 h-4" :fill="article.collectedByMe ? 'currentColor' : 'none'" />
          {{ article.collectedByMe ? t('article.collected') : t('article.collect') }} ·
          {{ formatCount(article.collectCount) }}
        </BaseButton>
      </div>

      <section class="mt-10">
        <h2 class="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <MessageSquare class="w-4 h-4 text-brand-500" />
          {{ t('article.comments') }}（{{ article.commentCount }}）
        </h2>

        <form class="flex gap-2 mb-6" @submit.prevent="submitComment">
          <BaseInput v-model="commentText" :placeholder="t('article.commentPlaceholder')" />
          <BaseButton type="submit" :loading="submitting" :disabled="!commentText.trim()">
            <Send class="w-4 h-4" />
          </BaseButton>
        </form>

        <div v-if="comments.length === 0" class="text-sm text-slate-400 text-center py-8">
          {{ t('article.noComments') }}
        </div>
        <div v-else class="flex flex-col gap-4">
          <div v-for="comment in comments" :key="comment.id" class="flex gap-3">
            <BaseAvatar :src="comment.author.avatar" :name="comment.author.username" size="sm" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-slate-700">{{
                  comment.author.username
                }}</span>
                <span class="text-xs text-slate-400">{{
                  timeAgo(comment.createdAt, locale, now)
                }}</span>
                <button
                  v-if="hydrated && auth.user?.id === comment.author.id"
                  class="ml-auto text-xs text-slate-400 hover:text-red-500"
                  @click="deleteComment(comment)"
                >
                  {{ t('article.delete') }}
                </button>
              </div>
              <p class="text-sm text-slate-700 mt-1 leading-relaxed">{{ comment.content }}</p>
            </div>
          </div>
        </div>
      </section>
    </article>

    <aside class="hidden lg:flex flex-col gap-4 sticky top-20">
      <section class="bg-white rounded-xl border border-slate-200 p-4">
        <div class="flex items-center gap-3">
          <BaseAvatar :src="article.author.avatar" :name="article.author.username" size="lg" />
          <div class="min-w-0">
            <p class="font-semibold text-slate-900">{{ article.author.username }}</p>
            <p class="text-xs text-slate-400 truncate">{{ article.author.bio ?? '' }}</p>
          </div>
        </div>
      </section>
    </aside>

    <!-- 封面大图灯箱 -->
    <Teleport to="body">
      <Transition name="cover-fade">
        <div
          v-if="coverPreviewOpen && article?.cover"
          class="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-slate-900/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          @click="closeCoverPreview"
        >
          <img
            :src="article.cover"
            :alt="article.title"
            class="max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl"
            @click.stop
          />
          <button
            type="button"
            class="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
            :aria-label="t('common.close')"
            @click.stop="closeCoverPreview"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cover-fade-enter-active,
.cover-fade-leave-active {
  transition: opacity 0.2s ease;
}

.cover-fade-enter-from,
.cover-fade-leave-to {
  opacity: 0;
}
</style>
