<script setup lang="ts">
import { BookOpen, Eye } from 'lucide-vue-next'
import type { AuthorInfo } from '@devshare/shared'
import { formatCount } from '~/utils/format'

interface HomeAuthorStat {
  author: AuthorInfo
  articleCount: number
  viewCount: number
}

defineProps<{ authors: HomeAuthorStat[] }>()
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <div v-if="authors.length > 0" class="flex flex-col">
    <NuxtLink
      v-for="(row, index) in authors"
      :key="row.author.id"
      :to="localePath(`/user/${row.author.id}`)"
      class="group flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
    >
      <BaseAvatar :src="row.author.avatar" :name="row.author.username" size="sm" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-slate-800 truncate group-hover:text-brand-600">
          {{ row.author.username }}
        </p>
        <p class="flex items-center gap-2.5 text-xs text-slate-400 mt-0.5">
          <span class="flex items-center gap-1">
            <BookOpen class="w-3 h-3" /> {{ row.articleCount }} {{ t('home.posts') }}
          </span>
          <span class="flex items-center gap-1">
            <Eye class="w-3 h-3" /> <ClientOnly>{{ formatCount(row.viewCount) }}</ClientOnly>
          </span>
        </p>
      </div>
      <span
        class="w-6 h-6 shrink-0 grid place-items-center rounded-md text-xs font-bold"
        :class="index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'"
      >
        {{ index + 1 }}
      </span>
    </NuxtLink>
  </div>
  <p v-else class="text-sm text-slate-400 py-4 text-center">{{ t('home.empty') }}</p>
</template>
