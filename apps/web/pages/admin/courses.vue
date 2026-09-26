<script setup lang="ts">
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-vue-next'
import {
  COURSE_DIFFICULTIES,
  type CourseDetail,
  type CourseDifficulty,
  type CourseInput,
  type CourseListItem,
  type CourseStatus,
  type EnrollmentItem,
  type Paginated,
  type TagDTO,
  type TeacherDTO,
} from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { difficultyLabel } from '~/utils/course'
import { useUpload } from '~/composables/useUpload'
import { gradientForSeed } from '~/utils/visual'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const { uploadImage } = useUpload()

const courses = ref<CourseListItem[]>([])
const teachers = ref<TeacherDTO[]>([])
const tags = ref<TagDTO[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const cursor = ref<string | null>(null)
const endReached = ref(false)
const tableRef = ref<{ scrollToTop: () => void } | null>(null)

// 游标分页：每页 24 条（后端 limit 上限），滚动触底再追加下一页
const PAGE_SIZE = 24

// 筛选条件分两份：filters 是工具条上还没提交的草稿，applied 才是请求真正用的条件。
// 输入框与下拉只改 filters，必须回车或点「搜索」才提交，不会边打字边打接口。
const filters = reactive({ q: '', status: 'all', difficulty: '' })
const applied = reactive({ q: '', status: 'all', difficulty: '' })

const modalOpen = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref<number | null>(null)
const formError = ref('')

const form = reactive({
  title: '',
  cover: '',
  summary: '',
  audience: [''],
  difficulty: 'beginner',
  badge: '',
  teacherId: '',
  tagIds: [] as number[],
  status: 'draft',
  sortOrder: '0',
})

const difficultyOptions = computed(() =>
  COURSE_DIFFICULTIES.map((value) => ({ value, label: difficultyLabel(value, locale.value) })),
)
const statusOptions = computed(() => [
  { value: 'draft', label: t('adminCourses.statusDraft') },
  { value: 'published', label: t('adminCourses.statusPublished') },
])
const teacherOptions = computed(() =>
  teachers.value.map((it) => ({ value: it.id, label: it.name })),
)

// 工具条下拉：状态默认「全部」（草稿也列出来），难度同理，「全部」用空串表示不筛选
const statusFilterOptions = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'published', label: t('adminCourses.statusPublished') },
  { value: 'draft', label: t('adminCourses.statusDraft') },
])
const difficultyFilterOptions = computed(() => [
  { value: '', label: t('common.all') },
  ...COURSE_DIFFICULTIES.map((value) => ({ value, label: difficultyLabel(value, locale.value) })),
])

// 报名名单弹窗
const enrollOpen = ref(false)
const enrollLoading = ref(false)
const enrollCourse = ref<CourseListItem | null>(null)
const enrollments = ref<EnrollmentItem[]>([])

// 请求参数：q / difficulty 为空就不带这个 key，status 直接透传（'all' 才会返回草稿）
function feedQuery(extra: Record<string, string | number | undefined> = {}) {
  return {
    status: applied.status,
    limit: PAGE_SIZE,
    q: applied.q.trim() || undefined,
    difficulty: applied.difficulty || undefined,
    ...extra,
  }
}

async function fetchFirstPage() {
  loading.value = true
  endReached.value = false
  cursor.value = null
  try {
    const res = await api.get<Paginated<CourseListItem>>('/courses', { query: feedQuery() })
    courses.value = res.items
    cursor.value = res.nextCursor
    endReached.value = !res.nextCursor
  } finally {
    loading.value = false
  }
}

// 触底加载下一页：VirtualTable 在「最后一个可见行已接近列表末尾」时回调
async function loadMore() {
  if (loading.value || loadingMore.value || endReached.value || !cursor.value) return
  loadingMore.value = true
  try {
    const res = await api.get<Paginated<CourseListItem>>('/courses', {
      query: feedQuery({ cursor: cursor.value }),
    })
    courses.value.push(...res.items)
    cursor.value = res.nextCursor
    if (!res.nextCursor) endReached.value = true
  } finally {
    loadingMore.value = false
  }
}

// 提交筛选：草稿条件拷进 applied，回到顶部再按新条件重拉第一页
function applyFilters() {
  applied.q = filters.q
  applied.status = filters.status
  applied.difficulty = filters.difficulty
  tableRef.value?.scrollToTop()
  void fetchFirstPage()
}

function clearFilters() {
  filters.q = ''
  filters.status = 'all'
  filters.difficulty = ''
  applyFilters()
}

// applied 里任一条件非默认时，空态用「搜索无结果」的文案
const hasActiveFilter = computed(
  () => applied.q.trim() !== '' || applied.status !== 'all' || applied.difficulty !== '',
)

// 就地更新后校验「枚举筛选」是否仍匹配：状态/难度不符的行要移出列表。
// 关键词不参与判断 —— 分词与命中字段是后端语义，前端不复制一份。
function keepRow(course: CourseListItem): boolean {
  if (applied.status !== 'all' && course.status !== applied.status) return false
  if (applied.difficulty && course.difficulty !== applied.difficulty) return false
  return true
}

// 编辑保存后就地替换那一行，滚动位置与其它已加载的行都不动
function replaceRow(course: CourseDetail) {
  const index = courses.value.findIndex((it) => it.id === course.id)
  if (index < 0) return
  if (keepRow(course)) courses.value[index] = course
  else courses.value.splice(index, 1)
}

async function loadOptions() {
  const [teacherList, tagList] = await Promise.all([
    api.get<TeacherDTO[]>('/teachers'),
    api.get<TagDTO[]>('/tags'),
  ])
  teachers.value = teacherList
  tags.value = tagList
}

function resetForm() {
  form.title = ''
  form.cover = ''
  form.summary = ''
  form.audience = ['']
  form.difficulty = 'beginner'
  form.badge = ''
  form.teacherId = teachers.value[0] ? String(teachers.value[0].id) : ''
  form.tagIds = []
  form.status = 'draft'
  form.sortOrder = '0'
  formError.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  modalOpen.value = true
}

async function openEdit(course: CourseListItem) {
  // 列表项不含 audience，编辑时取一次详情
  const detail = await api.get<CourseDetail>(`/courses/${course.id}`)
  editingId.value = detail.id
  form.title = detail.title
  form.cover = detail.cover ?? ''
  form.summary = detail.summary ?? ''
  form.audience = detail.audience.length > 0 ? [...detail.audience] : ['']
  form.difficulty = detail.difficulty
  form.badge = detail.badge ?? ''
  form.teacherId = String(detail.teacher.id)
  form.tagIds = detail.tags.map((tag) => tag.id)
  form.status = detail.status
  form.sortOrder = String(detail.sortOrder)
  formError.value = ''
  modalOpen.value = true
}

function toggleTag(id: number) {
  const index = form.tagIds.indexOf(id)
  if (index >= 0) form.tagIds.splice(index, 1)
  else form.tagIds.push(id)
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    form.cover = await uploadImage(file)
    toast.success(t('common.saved'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function save() {
  if (!form.title.trim()) {
    formError.value = t('adminCourses.requireTitle')
    return
  }
  if (!form.teacherId) {
    formError.value = t('adminCourses.requireTeacher')
    return
  }
  const payload: CourseInput = {
    title: form.title.trim(),
    cover: form.cover.trim() || null,
    summary: form.summary.trim() || null,
    audience: form.audience.map((item) => item.trim()).filter(Boolean),
    difficulty: form.difficulty as CourseDifficulty,
    badge: form.badge.trim() || null,
    status: form.status as CourseStatus,
    sortOrder: Number(form.sortOrder) || 0,
    teacherId: Number(form.teacherId),
    tagIds: form.tagIds,
  }

  saving.value = true
  const isEdit = editingId.value !== null
  try {
    if (isEdit) {
      // 编辑：用返回的详情就地替换那一行，滚动位置与其它已加载的行都不动
      replaceRow(await api.patch<CourseDetail>(`/courses/${editingId.value}`, payload))
    } else {
      await api.post('/courses', payload)
    }
    toast.success(t('common.saved'))
    modalOpen.value = false
    if (!isEdit) {
      // 新建的课不一定落在当前这页，回到顶部重拉第一页
      tableRef.value?.scrollToTop()
      await fetchFirstPage()
    }
  } catch {
    /* useApi 已经弹过错误提示 */
  } finally {
    saving.value = false
  }
}

async function toggleStatus(course: CourseListItem) {
  const status: CourseStatus = course.status === 'published' ? 'draft' : 'published'
  // 用 PATCH 返回的状态就地更新这一行，不重拉整页，滚动位置留在原处
  const updated = await api.patch<CourseDetail>(`/courses/${course.id}`, { status })
  toast.success(t('common.saved'))
  replaceRow(updated)
}

async function remove(course: CourseListItem) {
  if (!window.confirm(t('adminCourses.confirmDelete', { name: course.title }))) return
  await api.del(`/courses/${course.id}`)
  toast.success(t('common.saved'))
  // 就地删除：其余行不动，滚动位置也不跳
  courses.value = courses.value.filter((it) => it.id !== course.id)
}

async function openEnrollments(course: CourseListItem) {
  enrollCourse.value = course
  enrollments.value = []
  enrollOpen.value = true
  enrollLoading.value = true
  try {
    enrollments.value = await api.get<EnrollmentItem[]>(`/courses/${course.id}/enrollments`)
  } finally {
    enrollLoading.value = false
  }
}

onMounted(async () => {
  if (auth.user?.role !== 'admin') {
    router.replace(localePath('/'))
    return
  }
  await Promise.all([fetchFirstPage(), loadOptions()])
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{{ t('nav.adminCourses') }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ t('adminCourses.subtitle') }}</p>
      </div>

      <!-- 工具条：搜索框 + 状态/难度筛选；下拉只改待提交的 filters，回车或点「搜索」才一起提交 -->
      <div class="flex flex-wrap items-center gap-2">
        <form
          id="course-search"
          class="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 w-56 focus-within:ring-2 ring-brand-500/40"
          @submit.prevent="applyFilters"
        >
          <Search class="w-4 h-4 text-slate-400" />
          <input
            v-model="filters.q"
            type="search"
            :placeholder="t('adminCourses.searchPlaceholder')"
            class="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
          />
        </form>

        <BaseButton type="submit" form="course-search">
          {{ t('adminCourses.searchAction') }}
        </BaseButton>

        <BaseSelect v-model="filters.status" :options="statusFilterOptions" class="w-28" />
        <BaseSelect v-model="filters.difficulty" :options="difficultyFilterOptions" class="w-28" />

        <BaseButton v-if="hasActiveFilter" variant="secondary" @click="clearFilters">
          {{ t('adminCourses.clearSearch') }}
        </BaseButton>

        <BaseButton @click="openCreate">
          <Plus class="w-4 h-4" />
          {{ t('adminCourses.new') }}
        </BaseButton>
      </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <VirtualTable
        ref="tableRef"
        :items="courses"
        :columns="8"
        :loading="loading || loadingMore"
        table-class="min-w-[880px]"
        :end-reached="loadMore"
      >
        <template #head>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.cover') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.title') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.teacher') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.categories') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.difficulty') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right font-medium">
            {{ t('adminCourses.enrollCount') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-left font-medium">
            {{ t('adminCourses.status') }}
          </th>
          <th class="sticky top-0 z-10 bg-slate-50 px-4 py-3 text-right font-medium">
            {{ t('admin.actions') }}
          </th>
        </template>

        <template #row="{ item }">
          <!-- slot 泛型是 unknown（与 VirtualFeed 一致），先断言成 CourseListItem，再交给 v-for 做一次窄化 -->
          <template v-for="course in [item as CourseListItem]" :key="course.id">
            <td class="px-4 py-3 border-t border-slate-100">
              <div
                class="relative w-16 h-9 rounded overflow-hidden"
                :class="gradientForSeed(course.id)"
              >
                <img
                  v-if="course.cover"
                  :src="course.cover"
                  :alt="course.title"
                  class="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-slate-900 font-medium max-w-64">
              <NuxtLink
                :to="localePath(`/courses/${course.id}`)"
                class="line-clamp-2 hover:text-brand-600"
              >
                {{ course.title }}
              </NuxtLink>
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-slate-500 whitespace-nowrap">
              {{ course.teacher.name }}
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-slate-500">
              <span v-if="course.tags.length === 0">—</span>
              <span v-else class="line-clamp-1">{{
                course.tags.map((x) => x.name).join('、')
              }}</span>
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-slate-500 whitespace-nowrap">
              {{ difficultyLabel(course.difficulty, locale) }}
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-right text-slate-500">
              {{ course.enrollCount }}
            </td>
            <td class="px-4 py-3 border-t border-slate-100">
              <span
                class="inline-flex rounded px-1.5 py-0.5 text-xs"
                :class="
                  course.status === 'published'
                    ? 'bg-accent-50 text-accent-700'
                    : 'bg-slate-100 text-slate-500'
                "
              >
                {{
                  course.status === 'published'
                    ? t('adminCourses.statusPublished')
                    : t('adminCourses.statusDraft')
                }}
              </span>
            </td>
            <td class="px-4 py-3 border-t border-slate-100 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1">
                <BaseButton variant="ghost" size="sm" @click="openEnrollments(course)">
                  <Users class="w-4 h-4" /> {{ t('adminCourses.enrollments') }}
                </BaseButton>
                <BaseButton variant="ghost" size="sm" @click="toggleStatus(course)">
                  {{
                    course.status === 'published'
                      ? t('adminCourses.unpublish')
                      : t('adminCourses.publish')
                  }}
                </BaseButton>
                <BaseButton variant="ghost" size="sm" @click="openEdit(course)">
                  <Pencil class="w-4 h-4" /> {{ t('admin.edit') }}
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-red-500 hover:text-red-600"
                  @click="remove(course)"
                >
                  <Trash2 class="w-4 h-4" /> {{ t('admin.delete') }}
                </BaseButton>
              </div>
            </td>
          </template>
        </template>

        <template #empty>
          <td :colspan="8">
            <BaseEmpty
              v-if="!loading"
              :text="hasActiveFilter ? t('adminCourses.searchEmpty') : t('adminCourses.empty')"
            />
          </td>
        </template>
      </VirtualTable>
    </div>

    <BaseModal
      v-model="modalOpen"
      :title="editingId ? t('adminCourses.editTitle') : t('adminCourses.createTitle')"
      width="46rem"
    >
      <div class="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
        <BaseInput v-model="form.title" :label="t('adminCourses.title')" required />

        <div class="flex items-end gap-3">
          <BaseInput v-model="form.cover" :label="t('adminCourses.cover')" class="flex-1" />
          <BaseButton size="sm" variant="secondary" :loading="uploading">
            <label class="cursor-pointer">
              {{ t('common.upload') }}
              <input type="file" accept="image/*" class="hidden" @change="uploadCover" />
            </label>
          </BaseButton>
        </div>
        <div v-if="form.cover" class="relative w-56">
          <img
            :src="form.cover"
            :alt="t('adminCourses.cover')"
            class="aspect-video w-full rounded-lg border border-slate-200 object-cover"
          />
          <button
            type="button"
            class="absolute right-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-xs text-white hover:bg-slate-900/80"
            @click="form.cover = ''"
          >
            ×
          </button>
        </div>

        <BaseTextarea v-model="form.summary" :label="t('adminCourses.summary')" :rows="3" />

        <div class="flex flex-col gap-2">
          <span class="block text-sm font-medium text-slate-700">
            {{ t('adminCourses.audience') }}
          </span>
          <div v-for="(_, index) in form.audience" :key="index" class="flex items-center gap-2">
            <BaseInput
              v-model="form.audience[index]"
              :placeholder="t('adminCourses.audiencePlaceholder')"
              class="flex-1"
            />
            <BaseButton
              variant="ghost"
              size="sm"
              class="text-red-500 hover:text-red-600"
              @click="form.audience.splice(index, 1)"
            >
              <Trash2 class="w-4 h-4" />
            </BaseButton>
          </div>
          <BaseButton variant="ghost" size="sm" @click="form.audience.push('')">
            <Plus class="w-4 h-4" />
            {{ t('adminCourses.audienceAdd') }}
          </BaseButton>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BaseSelect
            v-model="form.difficulty"
            :label="t('adminCourses.difficulty')"
            :options="difficultyOptions"
          />
          <BaseSelect
            v-model="form.teacherId"
            :label="t('adminCourses.teacher')"
            :options="teacherOptions"
          />
          <BaseInput
            v-model="form.badge"
            :label="t('adminCourses.badge')"
            :placeholder="t('adminCourses.badgePlaceholder')"
          />
          <BaseInput v-model="form.sortOrder" :label="t('adminCourses.sortOrder')" type="number" />
        </div>

        <div>
          <span class="block text-sm font-medium text-slate-700 mb-1.5">
            {{ t('adminCourses.categories') }}
          </span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tag in tags"
              :key="tag.id"
              type="button"
              class="px-2.5 py-1 rounded-full text-xs border transition-colors"
              :class="
                form.tagIds.includes(tag.id)
                  ? 'border-brand-500 bg-brand-50 text-brand-600'
                  : 'border-slate-200 text-slate-500 hover:border-brand-300'
              "
              @click="toggleTag(tag.id)"
            >
              {{ tag.name }}
            </button>
          </div>
        </div>

        <BaseSelect
          v-model="form.status"
          :label="t('adminCourses.status')"
          :options="statusOptions"
        />

        <p v-if="formError" class="text-xs text-red-500">{{ formError }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" @click="modalOpen = false">
            {{ t('common.cancel') }}
          </BaseButton>
          <BaseButton :loading="saving" @click="save">{{ t('common.save') }}</BaseButton>
        </div>
      </div>
    </BaseModal>

    <BaseModal
      v-model="enrollOpen"
      :title="t('adminCourses.enrollmentsTitle', { title: enrollCourse?.title ?? '' })"
      width="40rem"
    >
      <div v-if="enrollLoading" class="py-8 text-center text-sm text-slate-400">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="enrollments.length === 0" class="py-6 text-center text-sm text-slate-400">
        {{ t('adminCourses.noEnrollments') }}
      </div>
      <table v-else class="w-full text-sm">
        <thead class="text-slate-500">
          <tr>
            <th class="text-left pb-2 font-medium">{{ t('adminCourses.student') }}</th>
            <th class="text-left pb-2 pl-4 font-medium">{{ t('adminCourses.status') }}</th>
            <th class="text-right pb-2 font-medium">{{ t('adminCourses.enrolledAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in enrollments" :key="item.id" class="border-t border-slate-100">
            <td class="py-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <BaseAvatar :src="item.user.avatar" :name="item.user.username" size="sm" />
                <div class="min-w-0">
                  <p class="text-slate-900 truncate">{{ item.user.username }}</p>
                  <p class="text-xs text-slate-400 truncate">{{ item.user.email }}</p>
                </div>
              </div>
            </td>
            <td class="py-2.5 pl-4">
              <span
                class="inline-flex rounded px-1.5 py-0.5 text-xs"
                :class="
                  item.status === 'enrolled'
                    ? 'bg-accent-50 text-accent-700'
                    : 'bg-slate-100 text-slate-500'
                "
              >
                {{
                  item.status === 'enrolled'
                    ? t('adminCourses.enrollStatusEnrolled')
                    : t('adminCourses.enrollStatusCanceled')
                }}
              </span>
            </td>
            <td class="py-2.5 text-right text-slate-500 whitespace-nowrap">
              {{ new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') }}
            </td>
          </tr>
        </tbody>
      </table>
    </BaseModal>
  </div>
</template>
