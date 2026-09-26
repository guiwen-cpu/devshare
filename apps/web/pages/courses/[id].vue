<script setup lang="ts">
import { CheckCircle2, Users } from 'lucide-vue-next'
import type { CourseDetail, EnrollmentResult } from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { difficultyLabel, enrollCountLabel } from '~/utils/course'
import { gradientForSeed } from '~/utils/visual'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const localePath = useLocalePath()

const courseId = computed(() => Number(route.params.id))

const { data: course, pending } = await useAsyncData(
  `course-${courseId.value}`,
  () => api.get<CourseDetail>(`/courses/${courseId.value}`),
  // 报名 / 取消报名是就地改 enrolledByMe 与 enrollCount，deep 才会触发重渲染
  { deep: true },
)

const submitting = ref(false)

/// 全部课程公益免费：登录后点一次即报名，没有支付环节
async function enroll() {
  if (!course.value) return
  if (!auth.isLoggedIn) {
    toast.info(t('course.loginRequired'))
    router.push(localePath('/login'))
    return
  }
  submitting.value = true
  try {
    const res = await api.post<EnrollmentResult>(`/courses/${course.value.id}/enroll`)
    course.value.enrolledByMe = res.enrolled
    course.value.enrollCount = res.enrollCount
    toast.success(t('course.enrollSuccess'))
  } catch {
    /* useApi 已经弹过错误提示 */
  } finally {
    submitting.value = false
  }
}

async function cancelEnroll() {
  if (!course.value) return
  if (!window.confirm(t('course.confirmCancel', { title: course.value.title }))) return
  submitting.value = true
  try {
    const res = await api.del<EnrollmentResult>(`/courses/${course.value.id}/enroll`)
    course.value.enrolledByMe = res.enrolled
    course.value.enrollCount = res.enrollCount
    toast.success(t('course.cancelSuccess'))
  } catch {
    /* useApi 已经弹过错误提示 */
  } finally {
    submitting.value = false
  }
}

useHead(() => ({ title: `${course.value?.title ?? ''} - DevShare` }))
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <div v-if="pending" class="flex flex-col gap-4">
      <BaseSkeleton class="h-64 rounded-2xl" />
      <BaseSkeleton class="h-8 w-2/3" />
      <BaseSkeleton class="h-40 rounded-xl" />
    </div>

    <BaseEmpty v-else-if="!course" :text="t('course.notFound')" />

    <div v-else class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
      <article class="min-w-0 flex flex-col gap-5">
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <!-- 没有封面图时用按课程 id 稳定的渐变底兜底 -->
          <div class="relative aspect-video" :class="gradientForSeed(course.id)">
            <img
              v-if="course.cover"
              :src="course.cover"
              :alt="course.title"
              class="absolute inset-0 w-full h-full object-cover"
            />
            <span
              v-if="course.badge"
              class="absolute top-3 right-3 rounded-md bg-brand-500/95 px-2.5 py-1 text-xs font-medium text-white shadow-sm"
            >
              {{ course.badge }}
            </span>
          </div>

          <div class="p-5">
            <h1 class="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              {{ course.title }}
            </h1>
            <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-slate-500">
              <span class="rounded bg-slate-100 px-2 py-0.5 text-xs">
                {{ difficultyLabel(course.difficulty, locale) }}
              </span>
              <span class="text-slate-300" aria-hidden="true">·</span>
              <span class="flex items-center gap-1 text-xs">
                <Users class="w-3.5 h-3.5" />
                {{ enrollCountLabel(course.enrollCount, locale) }}
              </span>
            </div>
          </div>
        </div>

        <section class="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 class="font-semibold text-slate-900 mb-3">{{ t('course.teacher') }}</h2>
          <div class="flex items-start gap-3">
            <BaseAvatar :src="course.teacher.avatar" :name="course.teacher.name" size="lg" />
            <div class="min-w-0">
              <p class="font-semibold text-slate-900">{{ course.teacher.name }}</p>
              <p class="mt-1 text-sm text-slate-500 leading-relaxed">
                {{ course.teacher.bio ?? '' }}
              </p>
            </div>
          </div>
        </section>

        <section
          v-if="course.audience.length > 0"
          class="bg-white rounded-2xl border border-slate-200 p-5"
        >
          <h2 class="font-semibold text-slate-900 mb-3">{{ t('course.audience') }}</h2>
          <ul class="flex flex-col gap-2">
            <li
              v-for="(item, index) in course.audience"
              :key="index"
              class="flex items-start gap-2 text-sm text-slate-600"
            >
              <CheckCircle2 class="w-4 h-4 mt-0.5 shrink-0 text-accent-500" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <section v-if="course.summary" class="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 class="font-semibold text-slate-900 mb-3">{{ t('course.summary') }}</h2>
          <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {{ course.summary }}
          </p>
        </section>
      </article>

      <aside class="lg:sticky lg:top-20">
        <div class="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
          <p class="text-xs font-medium text-accent-600">{{ t('course.freeNotice') }}</p>
          <p class="text-sm text-slate-600">{{ enrollCountLabel(course.enrollCount, locale) }}</p>

          <template v-if="course.enrolledByMe">
            <BaseButton variant="secondary" disabled block>
              <CheckCircle2 class="w-4 h-4" />
              {{ t('course.enrolled') }}
            </BaseButton>
            <BaseButton variant="ghost" block :loading="submitting" @click="cancelEnroll">
              {{ t('course.cancelEnroll') }}
            </BaseButton>
            <!-- 报名成功后的去处：个人主页「课程」tab（?tab=courses 深链） -->
            <NuxtLink
              v-if="auth.user"
              :to="{ path: localePath(`/user/${auth.user.id}`), query: { tab: 'courses' } }"
              class="text-center text-sm text-brand-600 hover:text-brand-700 hover:underline"
            >
              {{ t('course.myEnrollments') }}
            </NuxtLink>
          </template>
          <BaseButton v-else block :loading="submitting" @click="enroll">
            {{ t('course.enroll') }}
          </BaseButton>
        </div>
      </aside>
    </div>
  </div>
</template>
