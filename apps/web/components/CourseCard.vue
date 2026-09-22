<script setup lang="ts">
import type { CourseListItem } from '@devshare/shared'
import { difficultyLabel, enrollCountLabel } from '~/utils/course'
import { gradientForSeed } from '~/utils/visual'

defineProps<{ course: CourseListItem }>()
const { locale } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <NuxtLink
    :to="localePath(`/courses/${course.id}`)"
    class="group flex flex-col bg-white rounded-xl border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all overflow-hidden"
  >
    <!-- 封面固定 16:9；没有封面图时用按课程 id 稳定的渐变底兜底 -->
    <div class="relative aspect-video overflow-hidden" :class="gradientForSeed(course.id)">
      <img
        v-if="course.cover"
        :src="course.cover"
        :alt="course.title"
        loading="lazy"
        class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <span
        v-if="course.badge"
        class="absolute top-2 right-2 rounded-md bg-brand-500/95 px-2 py-0.5 text-xs font-medium text-white shadow-sm"
      >
        {{ course.badge }}
      </span>
    </div>

    <div class="flex flex-1 flex-col p-4">
      <h3
        :title="course.title"
        class="text-[15px] font-semibold leading-snug text-slate-900 line-clamp-2 group-hover:text-brand-600 transition-colors"
      >
        {{ course.title }}
      </h3>
      <p v-if="course.summary" class="mt-1.5 text-[13px] text-slate-500 line-clamp-2">
        {{ course.summary }}
      </p>

      <div class="mt-auto pt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <span class="rounded bg-slate-100 px-1.5 py-0.5">
          {{ difficultyLabel(course.difficulty, locale) }}
        </span>
        <span class="text-slate-300" aria-hidden="true">·</span>
        <span>{{ enrollCountLabel(course.enrollCount, locale) }}</span>
      </div>
    </div>
  </NuxtLink>
</template>
