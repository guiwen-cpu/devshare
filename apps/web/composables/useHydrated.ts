// 全局 hydration 完成标记：SSR 与客户端首帧均为 false，挂载后才变为 true。
// 用于把仅靠 localStorage 才知道的登录态等客户端私有状态，延迟到 hydration 后再渲染，
// 避免服务端（未登录）与客户端首帧（已登录）渲染不一致导致的 hydration 警告。
export function useHydrated() {
  const hydrated = useState<boolean>('is-hydrated', () => false)

  if (import.meta.client) {
    onMounted(() => {
      hydrated.value = true
    })
  }

  return hydrated
}
