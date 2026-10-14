import { defineStore } from 'pinia'
import type { ApiErrorBody, UserProfile } from '@devshare/shared'

interface AuthPayload {
  accessToken: string
  user: UserProfile
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    user: null as UserProfile | null,
    ready: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
  },
  actions: {
    setToken(token: string) {
      this.token = token
      if (import.meta.client) localStorage.setItem('df_token', token)
    },

    async init() {
      if (!import.meta.client) return
      this.token = localStorage.getItem('df_token') ?? ''
      if (!this.token) {
        this.ready = true
        return
      }
      try {
        this.user = await this.rawRequest<UserProfile>('/auth/me')
      } catch {
        this.token = ''
        this.user = null
        localStorage.removeItem('df_token')
      }
      this.ready = true
    },

    async login(email: string, password: string) {
      const payload = await this.rawRequest<AuthPayload>('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      this.applyAuth(payload)
    },

    async register(username: string, email: string, password: string) {
      const payload = await this.rawRequest<AuthPayload>('/auth/register', {
        method: 'POST',
        body: { username, email, password },
      })
      this.applyAuth(payload)
    },

    async refresh(): Promise<boolean> {
      if (!import.meta.client) return false
      try {
        const payload = await this.rawRequest<AuthPayload>('/auth/refresh', { method: 'POST' })
        this.applyAuth(payload)
        return true
      } catch {
        this.clearAuth()
        return false
      }
    },

    async logout() {
      if (import.meta.client) {
        try {
          await this.rawRequest('/auth/logout', { method: 'POST' })
        } catch {
          /* ignore */
        }
      }
      this.clearAuth()
    },

    applyAuth(payload: AuthPayload) {
      this.setToken(payload.accessToken)
      this.user = payload.user
    },

    clearAuth() {
      this.token = ''
      this.user = null
      if (import.meta.client) localStorage.removeItem('df_token')
    },

    async rawRequest<T>(
      path: string,
      options: {
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
        body?: unknown
      } = {},
    ): Promise<T> {
      const config = useRuntimeConfig()
      const base = import.meta.server
        ? (config.apiBase as string)
        : (config.public.apiBase as string)
      const headers: Record<string, string> = {}
      if (options.body) headers['Content-Type'] = 'application/json'
      if (this.token) headers.Authorization = `Bearer ${this.token}`
      try {
        const response = await $fetch.raw<{ data: T }>(`${base}${path}`, {
          method: options.method ?? 'GET',
          body: options.body as Record<string, any> | BodyInit | undefined,
          headers,
          credentials: 'include',
          retry: 0,
        })
        return (response._data as { data: T } | undefined)?.data ?? (response._data as T)
      } catch (err) {
        const body = (err as { data?: ApiErrorBody })?.data
        const error = new Error(body?.message ?? 'request failed') as Error & { code?: string }
        error.code = body?.code
        throw error
      }
    },
  },
})
