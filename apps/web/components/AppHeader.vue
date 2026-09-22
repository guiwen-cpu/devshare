<script setup lang="ts">
import { DEFAULT_TAGS } from '@devshare/shared'
import {
  GraduationCap,
  LogOut,
  PenLine,
  Search,
  Settings,
  Tags,
  User,
  UserCog,
} from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'
import { useHydrated } from '~/composables/useHydrated'

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const hydrated = useHydrated()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const searchKeyword = ref('')

const navTags = computed(() => DEFAULT_TAGS.slice(0, 6))

// 解析当前路由是否在某个标签页，如 /tag/frontend 或 /en/tag/frontend
const activeTagSlug = computed(() => {
  const segments = route.path.split('/').filter(Boolean)
  const tagIndex = segments.indexOf('tag')
  return tagIndex >= 0 && segments[tagIndex + 1] ? segments[tagIndex + 1] : null
})

function onSearch() {
  const q = searchKeyword.value.trim()
  if (!q) return
  router.push({ path: localePath('/search'), query: { q } })
}

async function onLogout() {
  await auth.logout()
  toast.success(t('article.deleteSuccess'))
  router.push(localePath('/'))
}
</script>

<template>
  <header class="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
      <NuxtLink :to="localePath('/')" class="flex items-center gap-2 shrink-0">
        <img src="~/assets/images/logo.svg" alt="" class="w-8 h-8 rounded-lg" />
        <span class="text-lg font-bold tracking-tight text-slate-900">DevShare</span>
      </NuxtLink>

      <nav class="hidden lg:flex items-center gap-1 text-sm text-slate-600">
        <NuxtLink
          :to="localePath('/')"
          class="px-3 py-1.5 rounded-md hover:bg-slate-100 hover:text-brand-600 shrink-0"
          :class="{
            'text-brand-600 font-medium bg-brand-50': route.path === '/' || route.path === '/en',
          }"
        >
          {{ t('nav.home') }}
        </NuxtLink>
        <NuxtLink
          v-for="tag in navTags"
          :key="tag.slug"
          :to="localePath(`/tag/${tag.slug}`)"
          class="px-3 py-1.5 rounded-md hover:bg-slate-100 hover:text-brand-600 shrink-0"
          :class="{
            'text-brand-600 font-medium bg-brand-50': activeTagSlug === tag.slug,
          }"
        >
          {{ tag.name }}
        </NuxtLink>
      </nav>

      <div class="flex-1" />

      <form
        class="hidden sm:flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 w-56 focus-within:ring-2 ring-brand-500/40"
        @submit.prevent="onSearch"
      >
        <Search class="w-4 h-4 text-slate-400" />
        <input
          v-model="searchKeyword"
          type="search"
          :placeholder="t('nav.search')"
          class="bg-transparent outline-none text-sm w-full text-slate-700 placeholder:text-slate-400"
        />
      </form>

      <BaseDropdown>
        <template #trigger>
          <button
            class="flex items-center gap-1 text-sm text-slate-600 hover:text-brand-600 px-2 py-1 rounded-md hover:bg-slate-100"
          >
            <span class="text-xs">{{ locale === 'zh' ? '中文' : 'EN' }}</span>
          </button>
        </template>
        <template #default>
          <button
            class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            :class="{ 'text-brand-600 font-medium': locale === 'zh' }"
            @click="setLocale('zh')"
          >
            中文
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            :class="{ 'text-brand-600 font-medium': locale === 'en' }"
            @click="setLocale('en')"
          >
            English
          </button>
        </template>
      </BaseDropdown>

      <template v-if="hydrated && auth.isLoggedIn && auth.user">
        <BaseDropdown align="right">
          <template #trigger>
            <BaseAvatar
              :src="auth.user.avatar"
              :name="auth.user.username"
              size="sm"
              class="cursor-pointer"
            />
          </template>
          <template #default>
            <NuxtLink
              :to="localePath(`/user/${auth.user.id}`)"
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            >
              <User class="w-4 h-4 text-slate-400" /> {{ t('nav.profile') }}
            </NuxtLink>
            <NuxtLink
              :to="localePath('/settings')"
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            >
              <Settings class="w-4 h-4 text-slate-400" /> {{ t('nav.settings') }}
            </NuxtLink>
            <NuxtLink
              v-if="auth.user?.role === 'admin'"
              :to="localePath('/admin/tags')"
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            >
              <Tags class="w-4 h-4 text-slate-400" /> {{ t('nav.adminTags') }}
            </NuxtLink>
            <NuxtLink
              v-if="auth.user?.role === 'admin'"
              :to="localePath('/admin/courses')"
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            >
              <GraduationCap class="w-4 h-4 text-slate-400" /> {{ t('nav.adminCourses') }}
            </NuxtLink>
            <NuxtLink
              v-if="auth.user?.role === 'admin'"
              :to="localePath('/admin/teachers')"
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md"
            >
              <UserCog class="w-4 h-4 text-slate-400" /> {{ t('nav.adminTeachers') }}
            </NuxtLink>
            <button
              class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-50 rounded-md text-red-500"
              @click="onLogout"
            >
              <LogOut class="w-4 h-4" /> {{ t('nav.logout') }}
            </button>
          </template>
        </BaseDropdown>
      </template>
      <template v-else>
        <NuxtLink
          :to="localePath('/login')"
          class="text-sm text-slate-600 hover:text-brand-600 px-2 py-1"
        >
          {{ t('nav.login') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/register')"
          class="hidden sm:inline-flex items-center gap-1 text-sm bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          {{ t('nav.register') }}
        </NuxtLink>
      </template>

      <NuxtLink
        v-if="hydrated && auth.isLoggedIn"
        :to="localePath('/write')"
        class="hidden sm:inline-flex items-center gap-1 text-sm bg-accent-500 text-white px-3 py-1.5 rounded-lg hover:bg-accent-600 transition-colors"
      >
        <PenLine class="w-4 h-4" />
        {{ t('nav.write') }}
      </NuxtLink>
    </div>
  </header>
</template>
