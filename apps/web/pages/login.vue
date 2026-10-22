<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()

const form = reactive({ email: '', password: '' })
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(form.email, form.password)
    toast.success(t('auth.loginSuccess'))
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : localePath('/')
    await navigateTo(redirect)
  } catch (e) {
    error.value = (e as Error & { code?: string }).message || t('common.error')
  } finally {
    submitting.value = false
  }
}

useHead({ title: `${t('auth.loginTitle')} - DevShare` })
</script>

<template>
  <div class="max-w-sm mx-auto mt-10 bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
    <h1 class="text-xl font-bold text-slate-900 mb-6">{{ t('auth.loginTitle') }}</h1>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <BaseInput v-model="form.email" type="email" :label="t('auth.email')" required />
      <BaseInput
        v-model="form.password"
        type="password"
        autocomplete="current-password"
        :label="t('auth.password')"
        required
      />
      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
      <BaseButton type="submit" :loading="submitting" block>
        {{ t('auth.loginBtn') }}
      </BaseButton>
      <p class="text-sm text-slate-500 text-center">
        {{ t('auth.noAccount') }}
        <NuxtLink :to="localePath('/register')" class="text-brand-600 hover:underline">
          {{ t('auth.goRegister') }}
        </NuxtLink>
      </p>
    </form>
  </div>
</template>
