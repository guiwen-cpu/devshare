<script setup lang="ts">
import { Flame } from 'lucide-vue-next'
import type { RankItem } from '@devshare/shared'
import { formatCount } from '~/utils/format'

defineProps<{ items: RankItem[] }>()
const localePath = useLocalePath()

const rankStyles = ['bg-red-500', 'bg-orange-400', 'bg-amber-400']
</script>

<template>
  <section class="bg-white rounded-xl border border-slate-200 p-4">
    <h2 class="flex items-center gap-2 font-semibold text-slate-900 mb-3">
      <Flame class="w-4 h-4 text-red-500" />
      <span>{{ $t('home.hotRank') }}</span>
    </h2>
    <ol class="flex flex-col gap-2.5">
      <li v-for="item in items" :key="item.article.id" class="flex items-start gap-2.5">
        <span
          class="w-5 h-5 rounded-md text-xs font-bold text-white grid place-items-center shrink-0 mt-0.5"
          :class="rankStyles[item.rank - 1] ?? 'bg-slate-200 text-slate-500'"
        >
          {{ item.rank }}
        </span>
        <div class="min-w-0">
          <NuxtLink
            :to="localePath(`/article/${item.article.id}`)"
            class="text-sm text-slate-700 hover:text-brand-600 leading-snug line-clamp-2"
          >
            {{ item.article.title }}
          </NuxtLink>
          <span class="text-xs text-slate-400">
            <ClientOnly>{{ formatCount(item.article.viewCount) }}</ClientOnly>
            {{ $t('article.views') }}
          </span>
        </div>
      </li>
    </ol>
  </section>
</template>
