import { muteVueSuspenseNotice } from '~/utils/dev-console'

/**
 * 开发期把 Vue 的 Suspense 提示从控制台摘掉：
 * 「<Suspense> is an experimental feature and its API will likely change.」
 *
 * 这句是 Vue 自己打的，边界来自 Nuxt（nuxt-root.vue / nuxt-layout.js），
 * 页面里没有我们写的 Suspense，所以只能这样消音。
 * 插件在 app.mount() 之前执行，能赶在根边界创建之前装好过滤器；
 * 生产构建里 import.meta.dev 为 false，直接空转。
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.dev) return
  muteVueSuspenseNotice()
})
