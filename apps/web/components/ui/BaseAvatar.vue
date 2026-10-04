<script setup lang="ts">
import { User } from 'lucide-vue-next'

// 头像存在 OSS 上，展示时统一改成 WebP（见 composables/useAssetUrl.ts）
const { assetUrl } = useAssetUrl()

const props = withDefaults(
  defineProps<{ src?: string | null; name?: string; size?: 'xs' | 'sm' | 'md' | 'lg' }>(),
  {
    size: 'md',
  },
)

const sizes = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
}

// 没有头像时优先显示昵称首字符（列表里比纯图标更有辨识度）
const initial = computed(() => (props.name ?? '').trim().charAt(0).toUpperCase() || '?')
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-accent-100 text-brand-700 overflow-hidden shrink-0"
    :class="sizes[size]"
  >
    <img
      v-if="src"
      :src="assetUrl(src)"
      :alt="name ?? 'avatar'"
      class="w-full h-full object-cover"
      loading="lazy"
    />
    <span v-else-if="name" class="font-semibold">{{ initial }}</span>
    <User v-else class="w-1/2 h-1/2" />
  </span>
</template>
