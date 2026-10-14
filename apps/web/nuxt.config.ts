import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/i18n', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  features: {
    inlineStyles: true, // 开启内联
  },
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
    // payloadExtraction: false,
  },
  components: [{ path: '~/components', pathPrefix: false }],
  vite: {
    plugins: [
      tailwindcss(),
      visualizer({ open: true, gzipSize: true, brotliSize: true }),
      ViteImageOptimizer({
        includePublic: true, // 确保扫描 public 目录[citation:25]
        png: { quality: 80 },
        jpg: { quality: 80 },
        webp: { quality: 75, lossless: false },
        avif: { quality: 50, lossless: false },
      }),
    ],
    // 曾经这里配过 rolldownOptions.output.codeSplitting.groups，把 md-editor-v3
    // 单独分成一个 chunk。实测它没有把编辑器隔离成懒加载 chunk，反而让整个编辑器
    // 依赖树（md-editor-v3 + katex + @codemirror + cropperjs，构建产物约 918 KB）
    // 并进了入口的 vendor chunk：首页 HTML 里出现它的 modulepreload，入口 chunk
    // 里出现 import{...}from"./DTfbj-xN.js"，外加一个 66 KB 渲染阻塞的 md-editor.css。
    // 首页一个编辑器都不用，却为此下载了近 1 MB。删掉分组规则后走 rolldown 默认
    // 切分，编辑器只被 pages/write/* 引用，会自然落进懒加载 chunk。
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
      // 读取时是否让 OSS 图片处理（IMG）把图片转成 WebP 再返回。
      // 默认开启；写成 off / false / 0 可一键回退原图（见 composables/useAssetUrl.ts）
      ossImageWebp: process.env.NUXT_PUBLIC_OSS_IMAGE_WEBP || 'on',
    },
  },

  routeRules: {
    // SSR + SWR：首页与文章详情做服务端渲染并缓存
    '/': { swr: 60 },
    '/article/**': { swr: 60 },
    '/courses/**': {
      swr: 60,
    },
    '/en': { swr: 60 },
    '/en/article/**': { swr: 60 },
    '/en/courses/**': { swr: 60 },
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
    // ali-oss 只用于浏览器直传（见 composables/useUpload.ts 里的动态 import），
    // 但它的 npm 包既没有 exports 字段，又把 lib/**/*.js 和 lib/**/*.ts 一起发布了。
    // Nitro 打服务端包时会走进 ali-oss，并把无扩展名的 require('./common/utils/encoder')
    // 解析到 .ts 上，而 Nitro 的 rollup 没有 TS 插件，于是报
    // "Expected ',', got ':' (Note that you need plugins to import files that are not JavaScript)"。
    // 在 rollup 这一层声明 external 最可靠：nitro.externals.external 在 Nitro 2.13 的
    // 新 externals 插件里只用于和 inline 规则比优先级，并不能强制外置。
    rollupConfig: {
      plugins: [
        {
          // Nuxt 会把这里的插件排在 Nitro 内置插件（alias / externals / nodeResolve）之前，
          // 所以能在 Nitro 走进 ali-oss 的源码之前就把它标成 external。
          name: 'externalize-ali-oss',
          resolveId(id: string) {
            if (id === 'ali-oss') return { id, external: true }
          },
        },
      ],
    },
    routeRules: {
      // '/oss-assets/**': {
      //   proxy: 'https://cdn.devshare.bond/**',
      // },
      '/api/**': {
        proxy: 'http://127.0.0.1:3001/api/**',
      },
    },
    devProxy: {
      '/api': {
        // h3 匹配 '/api' 前缀路由时会剥掉 /api 再转发，所以 target 需补上 /api，
        // 这样 /api/v1/articles -> /v1/articles -> http://127.0.0.1:3001/api/v1/articles。
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001/api',
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
