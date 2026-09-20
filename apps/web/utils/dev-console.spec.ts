import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { VUE_SUSPENSE_NOTICE, isVueSuspenseNotice, muteVueSuspenseNotice } from './dev-console'

/**
 * 从 Vue 的发布包里抠出它真正会打出来的那句话。
 * 只要 Vue 改了文案，这里就会挂 —— 提示我们同步更新 VUE_SUSPENSE_NOTICE，
 * 否则过滤会静悄悄地失效。
 */
function vueSuspenseNoticeFromDist(): string | undefined {
  const require = createRequire(import.meta.url)
  const source = readFileSync(require.resolve('vue/dist/vue.global.js'), 'utf8')
  return /`([^`]*is an experimental feature[^`]*)`/.exec(source)?.[1]
}

describe('VUE_SUSPENSE_NOTICE', () => {
  it('和 Vue 发布包里的原文逐字一致', () => {
    expect(vueSuspenseNoticeFromDist()).toBe(VUE_SUSPENSE_NOTICE)
  })
})

describe('isVueSuspenseNotice', () => {
  it('认得出 Vue 那句提示', () => {
    expect(isVueSuspenseNotice([VUE_SUSPENSE_NOTICE])).toBe(true)
  })

  it('别的日志一律放行', () => {
    expect(isVueSuspenseNotice(['hello'])).toBe(false)
    expect(isVueSuspenseNotice([new Error('boom')])).toBe(false)
    expect(isVueSuspenseNotice([undefined])).toBe(false)
    expect(isVueSuspenseNotice(['Suspense'])).toBe(false)
  })
})

describe('muteVueSuspenseNotice', () => {
  function fakeConsole() {
    const calls: unknown[][] = []
    const target = {
      info: (...args: unknown[]) => {
        calls.push(args)
      },
    }
    return { target, calls }
  }

  it('只吞掉 Suspense 提示，其余照旧输出', () => {
    const { target, calls } = fakeConsole()
    muteVueSuspenseNotice(target)

    target.info(VUE_SUSPENSE_NOTICE)
    target.info('keep me', 1)

    expect(calls).toEqual([['keep me', 1]])
  })

  it('恢复之后原样输出', () => {
    const { target, calls } = fakeConsole()
    const restore = muteVueSuspenseNotice(target)
    restore()

    target.info(VUE_SUSPENSE_NOTICE)

    expect(calls).toEqual([[VUE_SUSPENSE_NOTICE]])
  })
})
