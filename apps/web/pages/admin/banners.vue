<script setup lang="ts">
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { BannerDTO, BannerInput } from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { useUpload } from '~/composables/useUpload'

const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const { uploadImage } = useUpload()

const banners = ref<BannerDTO[]>([])
const loading = ref(false)
const modalOpen = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref<number | null>(null)
const formError = ref('')

const form = reactive({
  title: '',
  subtitle: '',
  image: '',
  link: '',
  sortOrder: '0',
  enabled: 'true',
})

const enabledOptions = computed(() => [
  { value: 'true', label: t('adminBanners.enabledOn') },
  { value: 'false', label: t('adminBanners.enabledOff') },
])

async function load() {
  loading.value = true
  try {
    // all=true 只有管理员拿得到停用项，普通用户会被后端静默忽略
    banners.value = await api.get<BannerDTO[]>('/banners', { query: { all: 'true' } })
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.title = ''
  form.subtitle = ''
  form.image = ''
  form.link = ''
  form.sortOrder = '0'
  form.enabled = 'true'
  formError.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  modalOpen.value = true
}

function openEdit(banner: BannerDTO) {
  editingId.value = banner.id
  form.title = banner.title
  form.subtitle = banner.subtitle ?? ''
  form.image = banner.image
  form.link = banner.link
  form.sortOrder = String(banner.sortOrder)
  form.enabled = banner.enabled ? 'true' : 'false'
  formError.value = ''
  modalOpen.value = true
}

async function uploadBannerImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    form.image = await uploadImage(file)
    toast.success(t('common.saved'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function save() {
  const title = form.title.trim()
  const image = form.image.trim()
  const link = form.link.trim()
  if (!title) {
    formError.value = t('adminBanners.requireTitle')
    return
  }
  if (!image) {
    formError.value = t('adminBanners.requireImage')
    return
  }
  if (!link) {
    formError.value = t('adminBanners.requireLink')
    return
  }

  const payload: BannerInput = {
    title,
    subtitle: form.subtitle.trim() || null,
    image,
    link,
    enabled: form.enabled === 'true',
    sortOrder: Number(form.sortOrder) || 0,
  }

  saving.value = true
  try {
    if (editingId.value) {
      await api.patch(`/banners/${editingId.value}`, payload)
    } else {
      await api.post('/banners', payload)
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

async function toggleEnabled(banner: BannerDTO) {
  try {
    await api.patch(`/banners/${banner.id}`, { enabled: !banner.enabled })
    toast.success(t('common.saved'))
    await load()
  } catch {
    /* useApi already toasts the error */
  }
}

async function remove(banner: BannerDTO) {
  if (!window.confirm(t('adminBanners.confirmDelete', { title: banner.title }))) return
  try {
    await api.del(`/banners/${banner.id}`)
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
        <h1 class="text-2xl font-bold text-slate-900">{{ t('nav.adminBanners') }}</h1>
        <p class="mt-1 text-sm text-slate-500">{{ t('adminBanners.subtitle') }}</p>
      </div>
      <BaseButton @click="openCreate">
        <Plus class="w-4 h-4" />
        {{ t('adminBanners.new') }}
      </BaseButton>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-slate-500">
          <tr>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminBanners.preview') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminBanners.title') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminBanners.link') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('adminBanners.sortOrder') }}</th>
            <th class="text-left px-4 py-3 font-medium">{{ t('adminBanners.enabled') }}</th>
            <th class="text-right px-4 py-3 font-medium">{{ t('admin.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="px-4 py-10 text-center text-slate-400">
              {{ t('common.loading') }}
            </td>
          </tr>
          <tr v-else-if="banners.length === 0">
            <td colspan="6">
              <BaseEmpty :text="t('adminBanners.empty')" />
            </td>
          </tr>
          <tr
            v-for="banner in banners"
            :key="banner.id"
            class="border-t border-slate-100 hover:bg-slate-50"
          >
            <td class="px-4 py-3">
              <div class="relative w-28 h-12 rounded-lg overflow-hidden bg-slate-100">
                <img
                  :src="banner.image"
                  :alt="banner.title"
                  class="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            </td>
            <td class="px-4 py-3 max-w-64">
              <p class="text-slate-900 font-medium truncate">{{ banner.title }}</p>
              <p v-if="banner.subtitle" class="text-xs text-slate-400 truncate">
                {{ banner.subtitle }}
              </p>
            </td>
            <td class="px-4 py-3 text-slate-500">
              <span class="block max-w-64 truncate">{{ banner.link }}</span>
            </td>
            <td class="px-4 py-3 text-right text-slate-500">{{ banner.sortOrder }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded px-1.5 py-0.5 text-xs"
                :class="
                  banner.enabled ? 'bg-accent-50 text-accent-700' : 'bg-slate-100 text-slate-500'
                "
              >
                {{ banner.enabled ? t('adminBanners.enabledOn') : t('adminBanners.enabledOff') }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex items-center gap-1">
                <BaseButton variant="ghost" size="sm" @click="toggleEnabled(banner)">
                  {{ banner.enabled ? t('adminBanners.disable') : t('adminBanners.enable') }}
                </BaseButton>
                <BaseButton variant="ghost" size="sm" @click="openEdit(banner)">
                  <Pencil class="w-4 h-4" /> {{ t('admin.edit') }}
                </BaseButton>
                <BaseButton
                  variant="ghost"
                  size="sm"
                  class="text-red-500 hover:text-red-600"
                  @click="remove(banner)"
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
      :title="editingId ? t('adminBanners.editTitle') : t('adminBanners.createTitle')"
      width="40rem"
    >
      <div class="flex flex-col gap-4">
        <BaseInput v-model="form.title" :label="t('adminBanners.title')" required />
        <BaseInput v-model="form.subtitle" :label="t('adminBanners.subtitle')" />

        <div class="flex items-end gap-3">
          <BaseInput
            v-model="form.image"
            :label="t('adminBanners.image')"
            class="flex-1"
            required
          />
          <BaseButton size="sm" variant="secondary" :loading="uploading">
            <label class="cursor-pointer">
              {{ t('common.upload') }}
              <input type="file" accept="image/*" class="hidden" @change="uploadBannerImage" />
            </label>
          </BaseButton>
        </div>
        <p class="-mt-2 text-xs text-slate-400">{{ t('adminBanners.imageHint') }}</p>
        <div v-if="form.image" class="relative w-56">
          <img
            :src="form.image"
            :alt="t('adminBanners.image')"
            class="aspect-video w-full rounded-lg border border-slate-200 object-cover"
          />
          <button
            type="button"
            class="absolute right-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-xs text-white hover:bg-slate-900/80"
            @click="form.image = ''"
          >
            ×
          </button>
        </div>

        <BaseInput
          v-model="form.link"
          :label="t('adminBanners.link')"
          :placeholder="t('adminBanners.linkPlaceholder')"
          required
        />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BaseInput v-model="form.sortOrder" :label="t('adminBanners.sortOrder')" type="number" />
          <BaseSelect
            v-model="form.enabled"
            :label="t('adminBanners.enabled')"
            :options="enabledOptions"
          />
        </div>

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
