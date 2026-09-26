import { onLCP, onFCP, onCLS, onINP, onTTFB } from 'web-vitals'

export default defineNuxtPlugin(() => {
  const report = (metric: any) => {
    // 上报到监控平台
    console.log(`[Web Vitals] ${metric.name}:`, metric.value)
  }

  onLCP(report)
  onFCP(report)
  onCLS(report)
  onINP(report)
  onTTFB(report)
})
