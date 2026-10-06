<script setup lang="ts">
import { Eye, Heart, MessageSquare } from 'lucide-vue-next'
import type { ArticleListItem } from '@devshare/shared'
import { formatCount, timeAgo } from '~/utils/format'
import { tagChipForSeed } from '~/utils/visual'
import { useNow } from '~/composables/useNow'

const props = defineProps<{ article: ArticleListItem; showRank?: boolean; rank?: number }>()
const { locale } = useI18n()
const now = useNow()
const localePath = useLocalePath()
// 封面与头像都在 OSS 上，展示时统一改成 WebP（见 composables/useAssetUrl.ts）
const { assetUrl } = useAssetUrl()
const visibleTags = computed(() => props.article.tags.slice(0, 2))
</script>

<template>
  <NuxtLink :to="localePath(`/article/${props.article.id}`)">
    <article
      class="group bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all h-40 flex gap-4 overflow-hidden p-4"
    >
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- 首行：序号/标签 + 发布时间 -->
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            v-if="showRank && rank !== undefined"
            class="w-5 h-5 rounded-md text-xs font-bold text-white grid place-items-center shrink-0"
            :class="rank <= 3 ? 'bg-red-500' : 'bg-slate-300'"
          >
            {{ rank }}
          </span>
          <NuxtLink
            v-for="tag in visibleTags"
            :key="tag.id"
            :to="localePath(`/tag/${tag.slug}`)"
            class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors shrink-0"
            :class="tagChipForSeed(tag.id)"
            @click.stop
          >
            {{ tag.name }}
          </NuxtLink>
          <time class="ml-auto shrink-0 text-xs text-slate-400">
            {{ timeAgo(props.article.publishedAt, locale, now) }}
          </time>
        </div>

        <div
          class="mt-1.5 text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2 group-hover:text-brand-600 transition-colors"
        >
          {{ props.article.title }}
        </div>

        <p class="mt-1 text-[13px] text-slate-500 line-clamp-1">
          {{ props.article.summary ?? '' }}
        </p>

        <div class="mt-auto flex items-center gap-2 text-xs text-slate-400">
          <NuxtLink
            @click.stop
            :to="localePath(`/user/${props.article.author.id}`)"
            class="flex items-center gap-1.5 hover:text-brand-600 min-w-0"
          >
            <BaseAvatar
              :src="props.article.author.avatar"
              :name="props.article.author.username"
              size="xs"
            />
            <span class="truncate max-w-28">{{ props.article.author.username }}</span>
          </NuxtLink>
          <span class="flex items-center gap-2.5 ml-auto shrink-0">
            <span class="flex items-center gap-1" :title="$t('article.views')">
              <Eye class="w-3.5 h-3.5" /> {{ formatCount(props.article.viewCount) }}
            </span>
            <span class="flex items-center gap-1" :title="$t('article.likes')">
              <Heart class="w-3.5 h-3.5" /> {{ formatCount(props.article.likeCount) }}
            </span>
            <span class="flex items-center gap-1" :title="$t('article.comments')">
              <MessageSquare class="w-3.5 h-3.5" /> {{ formatCount(props.article.commentCount) }}
            </span>
          </span>
        </div>
      </div>

      <!-- 右侧缩略图：有封面图用图，否则用按文章 id 稳定的渐变色占位 -->
      <div class="relative w-32 shrink-0 self-stretch overflow-hidden rounded-lg">
        <img
          v-if="props.article.cover"
          :src="assetUrl(props.article.cover)"
          :alt="props.article.title"
          loading="lazy"
          class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    </article>
  </NuxtLink>
</template>
