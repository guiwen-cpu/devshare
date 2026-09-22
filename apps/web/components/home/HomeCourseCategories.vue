<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
import type { CourseCategoryDTO } from '@devshare/shared'

const props = defineProps<{ categories: CourseCategoryDTO[] }>()
// 与左栏课程 tab 共用同一份选中状态，点这里等于切左栏 tab
const activeTag = defineModel<string | null>({ default: null })

const { t } = useI18n()
</script>

<template>
  <section
    v-if="props.categories.length > 0"
    class="bg-white rounded-xl border border-slate-200 p-4"
  >
    <h2 class="flex items-center gap-2 font-semibold text-slate-900 mb-3">
      <Compass class="w-4 h-4 text-brand-500" />
      <span>{{ t('home.courseCategories') }}</span>
    </h2>
    <div class="flex flex-col">
      <button
        class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors"
        :class="
          activeTag === null
            ? 'bg-brand-50 text-brand-600 font-medium'
            : 'text-slate-600 hover:bg-slate-50'
        "
        @click="activeTag = null"
      >
        <span>{{ t('course.all') }}</span>
      </button>
      <button
        v-for="category in props.categories"
        :key="category.id"
        class="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors"
        :class="
          activeTag === category.slug
            ? 'bg-brand-50 text-brand-600 font-medium'
            : 'text-slate-600 hover:bg-slate-50'
        "
        @click="activeTag = category.slug"
      >
        <span class="truncate">{{ category.name }}</span>
        <span class="shrink-0 text-xs text-slate-400">{{ category.courseCount }}</span>
      </button>
    </div>
  </section>
</template>
