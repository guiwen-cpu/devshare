<script setup lang="ts">
import type { TagDTO } from '@devshare/shared'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()

const tags = ref<TagDTO[]>([])
const loading = ref(false)
const modalOpen = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ name: '', slug: '' })
const formError = ref('')

async function load() {
  loading.value = true
  try {
    tags.value = await api.get<TagDTO[]>('/tags')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.slug = ''
  formError.value = ''
  modalOpen.value = true
}

function openEdit(tag: TagDTO) {
  editingId.value = tag.id
  form.name = tag.name
  form.slug = tag.slug
  formError.value = ''
  modalOpen.value = true
}

async function save() {
  const name = form.name.trim()
  const slug = form.slug.trim()
  if (!name) {
    formError.value = t('admin.requireName')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await api.put(`/tags/${editingId.value}`, { name, slug: slug || undefined })
    } else {
      await api.post('/tags', { name, slug: slug || undefined })
    }
    toast.success(t('common.saved'))
    modalOpen.value = false
    await load()
  } catch {
    /* useApi already toasts the error */
  } finally {
    saving.value = false
  }
}

async function remove(tag: TagDTO) {
  if (!window.confirm(t('admin.confirmDelete', { name: tag.name }))) return
  try {
    await api.del(`/tags/${tag.id}`)
    toast.success(t('common.saved'))
    await load()
  } catch {
    /* useApi already toasts the error */
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
        <h1 class="text-2xl font-bold text-slate-900">{{ t('nav.adminTags') }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ t('admin.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreate">
        <Plus class="w-4 h-4" />
        {{ t('admin.new') }}
      </BaseButton>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500">
          <tr>
            <th class="text-left px-4 py-3 font-medium">{{ t('admin.name') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('admin.slug') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('admin.articleCount') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="4" class="px-4 py-10 text-center text-slate-400">
              {{ t('common.loading') }}
            </td>
          </tr>
          <tr v-else-if="tags.length === 0">
            <td colspan="4">
              <BaseEmpty :text="t('admin.empty')" />
            </td>
          </tr>
          <tr v-for="tag in tags" :key="tag.id" class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-3 text-slate-900 font-medium">{{ tag.name }}</td>
            <td class="px-4 py-3 text-slate-500">{{ tag.slug }}</td>
            <td class="px-4 py-3 text-right text-slate-500">{{ tag.articleCount }}</td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex items-center gap-1">
                <BaseButton variant="ghost" size="sm" @click="openEdit(tag)">
                  <Pencil class="w-4 h-4" /> {{ t('admin.edit') }}
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-red-500 hover:text-red-600"
                  @click="remove(tag)"
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
      :title="editingId ? t('admin.editTitle') : t('admin.createTitle')"
    >
      <div class="flex flex-col gap-4">
        <BaseInput v-model="form.name" :label="t('admin.name')" required />
        <BaseInput
          v-model="form.slug"
          :label="t('admin.slug')"
          :placeholder="t('admin.slugPlaceholder')"
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
