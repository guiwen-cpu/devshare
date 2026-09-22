<script setup lang="ts">
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { TeacherDTO, TeacherInput } from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { useUpload } from '~/composables/useUpload'

const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const { uploadImage } = useUpload()

const teachers = ref<TeacherDTO[]>([])
const loading = ref(false)
const modalOpen = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref<number | null>(null)
const formError = ref('')
const form = reactive({ name: '', avatar: '', bio: '' })

async function load() {
  loading.value = true
  try {
    teachers.value = await api.get<TeacherDTO[]>('/teachers')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.avatar = ''
  form.bio = ''
  formError.value = ''
  modalOpen.value = true
}

function openEdit(teacher: TeacherDTO) {
  editingId.value = teacher.id
  form.name = teacher.name
  form.avatar = teacher.avatar ?? ''
  form.bio = teacher.bio ?? ''
  formError.value = ''
  modalOpen.value = true
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    form.avatar = await uploadImage(file)
    toast.success(t('common.saved'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function save() {
  if (!form.name.trim()) {
    formError.value = t('adminTeachers.requireName')
    return
  }
  const payload: TeacherInput = {
    name: form.name.trim(),
    avatar: form.avatar.trim() || null,
    bio: form.bio.trim() || null,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await api.patch(`/teachers/${editingId.value}`, payload)
    } else {
      await api.post('/teachers', payload)
    }
    toast.success(t('common.saved'))
    modalOpen.value = false
    await load()
  } catch {
    /* useApi 已经弹过错误提示 */
  } finally {
    saving.value = false
  }
}

async function remove(teacher: TeacherDTO) {
  if (!window.confirm(t('adminTeachers.confirmDelete', { name: teacher.name }))) return
  try {
    await api.del(`/teachers/${teacher.id}`)
    toast.success(t('common.saved'))
    await load()
  } catch {
    /* 名下仍有课程时后端返回 409，错误提示由 useApi 统一弹出 */
  }
}

onMounted(async () => {
  if (auth.user?.role !== 'admin') {
    router.replace(localePath('/'))
    return
  }
  await load()
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{{ t('nav.adminTeachers') }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ t('adminTeachers.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreate">
        <Plus class="w-4 h-4" />
        {{ t('adminTeachers.new') }}
      </BaseButton>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500">
          <tr>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminTeachers.avatar') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminTeachers.name') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminTeachers.bio') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('adminTeachers.courseCount') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="px-4 py-10 text-center text-slate-400">
              {{ t('common.loading') }}
            </td>
          </tr>
          <tr v-else-if="teachers.length === 0">
            <td colspan="5">
              <BaseEmpty :text="t('adminTeachers.empty')" />
            </td>
          </tr>
          <tr
            v-for="teacher in teachers"
            :key="teacher.id"
            class="border-t border-slate-100 hover:bg-slate-50"
          >
            <td class="px-4 py-3">
              <BaseAvatar :src="teacher.avatar" :name="teacher.name" size="sm" />
            </td>
            <td class="px-4 py-3 text-slate-900 font-medium whitespace-nowrap">
              {{ teacher.name }}
            </td>
            <td class="px-4 py-3 text-slate-500 max-w-96">
              <span class="line-clamp-2">{{ teacher.bio ?? '—' }}</span>
            </td>
            <td class="px-4 py-3 text-right text-slate-500">{{ teacher.courseCount ?? 0 }}</td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex items-center gap-1">
                <BaseButton variant="ghost" size="sm" @click="openEdit(teacher)">
                  <Pencil class="w-4 h-4" /> {{ t('admin.edit') }}
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-red-500 hover:text-red-600"
                  @click="remove(teacher)"
                >
                  <Trash2 class="w-4 h-4" /> {{ t('admin.delete') }}
                </BaseButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <BaseModal
      v-model="modalOpen"
      :title="editingId ? t('adminTeachers.editTitle') : t('adminTeachers.createTitle')"
    >
      <div class="flex flex-col gap-4">
        <BaseInput v-model="form.name" :label="t('adminTeachers.name')" required />

        <div class="flex items-end gap-3">
          <BaseInput v-model="form.avatar" :label="t('adminTeachers.avatar')" class="flex-1" />
          <BaseButton size="sm" variant="secondary" :loading="uploading">
            <label class="cursor-pointer">
              {{ t('common.upload') }}
              <input type="file" accept="image/*" class="hidden" @change="uploadAvatar" />
            </label>
          </BaseButton>
        </div>
        <div v-if="form.avatar">
          <BaseAvatar :src="form.avatar" :name="form.name" size="lg" />
        </div>

        <BaseTextarea
          v-model="form.bio"
          :label="t('adminTeachers.bio')"
          :placeholder="t('adminTeachers.bioPlaceholder')"
          :rows="3"
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
  </div>
</template>
