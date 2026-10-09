<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <footer class="border-t border-slate-200 bg-white">
    <div
      class="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500"
    >
      <div class="flex items-center gap-2">
        <img src="~/assets/images/logo.svg" alt="" class="w-8 h-8 rounded-lg" />
        <span>{{ t('footer.desc') }}</span>
      </div>
      <div class="flex items-center gap-4">
        <span>{{ t('footer.icp') }}</span>
        <a
          href="https://github.com/guiwen-cpu/devshare"
          target="_blank"
          rel="noopener"
          class="hover:text-brand-600"
          >GitHub</a
        >
        <NuxtLink :to="localePath('/dev/components')" class="hover:text-brand-600">
          {{ t('dev.title') }}
        </NuxtLink>
      </div>
    </div>
  </footer>
</template>
