/**
 * 开发期控制台噪音过滤。
 *
 * Vue 在创建 <Suspense> 边界时会打一条 console.info：
 * 「<Suspense> is an experimental feature and its API will likely change.」
 * 而页面上的 Suspense 边界不是我们写的 —— Nuxt 的 nuxt-root.vue 和 nuxt-layout.js 各包了一层，
 * 所以每次刷新都会出现（仅开发期、每个页面只打一次）。它只是提示，不是报错。
 *
 * Vue 没给开关：这句直接走 console.info，绕过了 app.config.warnHandler；
 * 构建标志 __FEATURE_SUSPENSE__ 在发布包里也已经被内联成 true。只能自己拦掉。
 */

/** Vue 打出的原文，改动 Vue 版本时单测会先发现（见 dev-console.spec.ts） */
export const VUE_SUSPENSE_NOTICE =
  '<Suspense> is an experimental feature and its API will likely change.'

/** 只有整句正好是那条 Suspense 提示才返回 true，其余日志一律放行 */
export function isVueSuspenseNotice(args: readonly unknown[]): boolean {
  const first = args[0]
  return typeof first === 'string' && first.includes(VUE_SUSPENSE_NOTICE)
}

/**
 * 把这条提示从控制台摘掉，返回「恢复原样」的函数。
 *
 * 只动 info 一个方法：Vue 用的是 console[console.info ? 'info' : 'log']，
 * 现代浏览器都会走 info，没必要把 log 也包一层。
 */
export function muteVueSuspenseNotice(consoleLike: Pick<Console, 'info'> = console): () => void {
  const original = consoleLike.info
  consoleLike.info = (...args: unknown[]) => {
    if (isVueSuspenseNotice(args)) return
    original.apply(consoleLike, args)
  }
  return () => {
    consoleLike.info = original
  }
}
