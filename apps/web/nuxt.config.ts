import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/i18n', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      // Nuxt 没有 index.html，浏览器标签页的 favicon 通过 <head> 注入。
      // 图标文件放在 public/favicon.svg（public 里的文件会原样发布到站点根目录）。
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  ssr: true,
  experimental: {
    // 关闭 payload 提取：把 useAsyncData 数据内联进 HTML，避免 SSR 渲染与
    // _payload.json 各请求一次导致 viewCount 等动态字段不一致的 hydration 警告。
    payloadExtraction: false,
  },
  components: [{ path: '~/components', pathPrefix: false }],
  vite: {
    plugins: [tailwindcss()],
  },

  devServer: {
    // Windows 下 Nuxt 默认只绑定 IPv6 localhost (::1)，导致 127.0.0.1:3000 连不上，
    // 浏览器 fetch 上传时报 Failed to fetch。改用双栈 ::，同时监听 IPv4 + IPv6。
    host: '::',
  },

  runtimeConfig: {
    // 服务端直连 API（容器内网 / 本地 dev 地址），需要带上 /api/v1 全局前缀。
    // 用 127.0.0.1 而非 localhost，避免 Windows 下 localhost 优先解析到 IPv6 ::1。
    // 这里只写本地默认值；Docker 部署时由 compose 注入的 NUXT_API_BASE 在运行时覆盖。
    apiBase: 'http://127.0.0.1:3001/api/v1',
    public: {
      // 浏览器侧走同源代理（nginx / nitro devProxy）
      apiBase: '/api/v1',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    },
  },

  routeRules: {
    // SSR + SWR：首页与文章详情做服务端渲染并缓存
    '/': { swr: 60 },
    '/article/**': { swr: 60 },
    '/en': { swr: 60 },
    '/en/article/**': { swr: 60 },
    // 其余重交互页面保持 SPA，减少服务端渲染开销
    '/write': { ssr: false },
    '/write/**': { ssr: false },
    '/settings': { ssr: false },
    '/user/**': { ssr: false },
    '/search': { ssr: false },
    '/tag/**': { ssr: false },
    '/login': { ssr: false },
    '/register': { ssr: false },
    '/dev/**': { ssr: false },
  },

  nitro: {
    // routeRules: {
    //   '/oss-assets/**': {
    //     proxy: 'https://devshare-assets.oss-cn-guangzhou.aliyuncs.com/**',
    //   },
    // },
    devProxy: {
      '/api': {
        // h3 匹配 '/api' 前缀路由时会剥掉 /api 再转发，所以 target 需补上 /api，
        // 这样 /api/v1/articles -> /v1/articles -> http://127.0.0.1:3001/api/v1/articles。
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001/api',
        changeOrigin: true,
      },
      '/uploads': {
        target:
          (process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001/api').replace(/\/api$/, '') +
          '/uploads',
        changeOrigin: true,
      },
    },
  },

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'zh',
    locales: [
      { code: 'zh', name: '中文', language: 'zh-CN', file: 'zh.json' },
      { code: 'en', name: 'English', language: 'en', file: 'en.json' },
    ],
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'df_locale',
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: 'zh',
    },
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  },
})
