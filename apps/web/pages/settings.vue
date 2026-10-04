<script setup lang="ts">
import {
  IMAGE_ACCEPT,
  IMAGE_MIME_TYPES,
  type ImageUploadConfig,
  type UserProfile,
} from '@devshare/shared'
import { useAuthStore } from '~/stores/auth'
import { useUpload } from '~/composables/useUpload'
import { formatFileSize } from '~/utils/video'

const { t, setLocale } = useI18n()
const api = useApi()
const auth = useAuthStore()
const toast = useToast()
const { uploadImage, fetchImageConfig } = useUpload()

const form = reactive({
  username: auth.user?.username ?? '',
  bio: auth.user?.bio ?? '',
  avatar: auth.user?.avatar ?? '',
  locale: auth.user?.locale ?? 'zh',
})
const saving = ref(false)
const uploading = ref(false)

// 图片直传配置（登录即可读）：决定上传按钮是否可用，以及提示里的体积/格式。
// null 表示还没读到，避免首屏闪一下「未启用」。
const imageConfig = ref<ImageUploadConfig | null>(null)
const imageAccept = computed(() => imageConfig.value?.accept.join(',') || IMAGE_ACCEPT)
const imageTypesLabel = computed(() => {
  const accept = imageConfig.value?.accept
  return (accept && accept.length > 0 ? accept : IMAGE_MIME_TYPES)
    .map((mime) => mime.replace('image/', '').toUpperCase())
    .join(' / ')
})
const imageMaxLabel = computed(() => formatFileSize(imageConfig.value?.maxBytes ?? 0))

onMounted(async () => {
  try {
    imageConfig.value = await fetchImageConfig()
  } catch {
    // 读不到配置就按「未启用」处理：按钮置灰，避免点了才报错
    imageConfig.value = { enabled: false, maxBytes: 0, accept: [] }
  }
})

async function uploadAvatar(e: Event) {
  const input = e.target as HTMLInputElement
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
  saving.value = true
  try {
    const updated = await api.patch<UserProfile>('/users/me', {
      username: form.username,
      bio: form.bio,
      avatar: form.avatar || undefined,
      locale: form.locale,
    })
    auth.user = updated
    setLocale(updated.locale)
    toast.success(t('common.saved'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto bg-white rounded-xl border border-slate-200 p-6">
    <h1 class="text-xl font-bold text-slate-900 mb-6">{{ t('nav.settings') }}</h1>

    <div class="flex items-center gap-4 mb-6">
      <BaseAvatar :src="form.avatar" :name="form.username" size="lg" />
      <div class="flex flex-col gap-2">
        <BaseButton
          size="sm"
          variant="secondary"
          :loading="uploading"
          :disabled="!imageConfig?.enabled"
        >
          <label class="cursor-pointer">
            {{ t('common.upload') }}
            <input type="file" :accept="imageAccept" class="hidden" @change="uploadAvatar" />
          </label>
        </BaseButton>
        <span v-if="imageConfig && !imageConfig.enabled" class="text-xs text-slate-400">
          {{ t('errors.IMAGE_UPLOAD_DISABLED') }}
        </span>
        <span v-else-if="imageConfig" class="text-xs text-slate-400">
          {{ t('common.imageUploadHint', { types: imageTypesLabel, size: imageMaxLabel }) }}
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-4">
      <BaseInput v-model="form.username" :label="t('auth.username')" required />
      <BaseTextarea v-model="form.bio" :label="t('write.summary')" :rows="3" />
      <BaseSelect
        v-model="form.locale"
        :label="t('nav.language')"
        :options="[
          { value: 'zh', label: '中文' },
          { value: 'en', label: 'English' },
        ]"
      />
      <BaseButton :loading="saving" @click="save">
        {{ t('common.save') }}
      </BaseButton>
    </div>
  </div>
</template>
