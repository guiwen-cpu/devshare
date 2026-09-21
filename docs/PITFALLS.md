# 开发问题汇总（踩坑记录）

开发过程中真切踩到、且不看记录很可能再踩一次的坑。写下来是为了下次能对号入座，不用重新查一遍。

- 环境类问题（容器起不来、端口被占用、依赖装不上、上传报 `Failed to fetch` 等）不在这里，见 [LOCAL_DEV.md](LOCAL_DEV.md) 第 7 节「常见问题排查」。
- 每条按「现象 / 原因 / 处理 / 相关文件」写，现象要写到能一眼认出来。
- 踩到新坑就顺着往下追加编号，修完顺手写；隔一天多半就想不起当时的原因了。

## 数据与响应式

### 1. 点赞成功，但按钮文案和数字过一会儿才变

**现象**：点赞接口已经返回成功（`liked` 为 `true`、`likeCount` 为 `1`，Network 面板可见），页面上还是「点赞 · 0」；过一会儿、或者鼠标移开再移回来才刷新。收藏、评论数同理。

**原因**：Nuxt 4 的 `useAsyncData` 默认 `deep: false`（`experimental.defaults.useAsyncData.deep`，Nuxt 4 起由 `true` 改为 `false`），返回的 `data` 是 `shallowRef`。`article.value.likedByMe = res.liked` 这种「取出 `.value` 就地改字段」的写法改的是普通对象属性，不会触发渲染；要等下一次由别的响应式变化（`useNow` 的分钟级 tick、子组件重渲染等）带动模板重渲染，才会顺带读到新值。

**处理**：给需要就地改字段的 `useAsyncData` 显式加 `{ deep: true }`：

```ts
const { data: article } = await useAsyncData(
  `article-${articleId.value}`,
  () => api.get<ArticleDetail>(`/articles/${articleId.value}`),
  { deep: true },
)
```

也可以在 `nuxt.config.ts` 里设 `experimental.defaults.useAsyncData.deep = true` 一次性恢复 Nuxt 3 行为，但那会让全站所有 `useAsyncData` 数据都变成深响应；权衡后这里用页面级开关。

**相关文件**：`apps/web/pages/article/[id].vue`、`apps/web/pages/user/[id].vue`
**记录时间**：2026-09-18

## SSR 与水合

### 2. 登录状态下刷新页面，控制台报 hydration mismatch

**现象**：控制台出现 hydration 不一致警告，头像和作者本人的「编辑 / 删除」按钮在首帧闪一下才出来。

**原因**：登录 token 存在 `localStorage`（`stores/auth.ts`），服务端渲染时读不到，于是服务端按「未登录」渲染、客户端首帧按「已登录」渲染，两边 DOM 对不上。

**处理**：用 `useHydrated()`（内部是 `useState('is-hydrated')`，SSR 与客户端首帧都是 `false`）把「只有客户端才知道」的状态延后到 hydration 之后再渲染 —— 模板里先判断 `hydrated`，再比较 `auth.user?.id` 这类条件；`plugins/hydrated.client.ts` 在 `app:mounted` 时把它置为 `true`。

**相关文件**：`apps/web/composables/useHydrated.ts`、`apps/web/plugins/hydrated.client.ts`、`apps/web/components/AppHeader.vue`
**记录时间**：2026-09-18

### 3. 相对时间在服务端和客户端算出来不一样

**现象**：列表和评论里的「x 分钟前」触发 hydration 不一致警告；页面放着不动，时间也不会自己往前走。

**原因**：`timeAgo` 依赖当前时间，服务端渲染取一次 `Date.now()`、客户端 hydration 再取一次，两个基准哪怕差几百毫秒都可能跨过「刚刚 / 1 分钟前」的边界。

**处理**：`useNow()` 用 `useState('hydrate-now', () => Date.now())` 生成时间基准，SSR 这一次的值通过 Nuxt payload 同步给客户端，两边同源；客户端挂载后再每分钟 tick 一次，时间不会僵住。组件里统一用 `timeAgo(时间, locale, now)`。

**相关文件**：`apps/web/composables/useNow.ts`、`apps/web/utils/format.ts`
**记录时间**：2026-09-18

### 4. 开着 payloadExtraction 时，浏览量这类字段两边不一致

**现象**：文章详情页的 `viewCount` 在 hydration 时对不上，控制台报 hydration 警告。

**原因**：开启 payload 提取后，SSR 渲染和 `_payload.json` 会各请求一次接口，`viewCount` 这种每次请求都在变的字段两次拿到的值不同，并且拖慢首屏。

**处理**：`nuxt.config.ts` 里设 `experimental.payloadExtraction: false`，把 `useAsyncData` 的数据直接内联进 HTML，只请求一次。

**相关文件**：`apps/web/nuxt.config.ts`
**记录时间**：2026-09-18

## 海报截图（html2canvas）

### 5. 海报节点里用了 Tailwind 颜色类，截图直接抛错

**现象**：点「生成海报」报 `unsupported color function: oklch` 之类的错，图出不来。

**原因**：Tailwind v4 的调色板编译出来是 `oklch()`，html2canvas 1.4.1 解析不了，遇到就抛错。

**处理**：海报节点（`ArticlePosterCard.vue`）里不用任何 Tailwind 类，颜色一律内联 hex（走 `POSTER_COLOR`），排版用绝对定位 + 像素值。

**相关文件**：`apps/web/components/ArticlePosterCard.vue`、`apps/web/utils/poster.ts`
**记录时间**：2026-09-18

### 6. 海报里的长文本不折行，直接顶出画布

**现象**：标题或摘要一长，文字溢出海报边界，不会自动换行。

**原因**：CSS 的 `-webkit-line-clamp` html2canvas 不认识，按 CSS 走就是一行铺到底。

**处理**：折行在 JS 里按字符算好，模板按算出来的行渲染，见 `utils/poster.ts` 里的 `wrapText` / `ellipsize`，单测在同目录 `poster.spec.ts`。

**相关文件**：`apps/web/utils/poster.ts`、`apps/web/utils/poster.spec.ts`
**记录时间**：2026-09-18

### 7. 截图出来的海报缩在画布左上角

**现象**：下载的图整体变小、挤在一角，只有预览里看着正常。

**原因**：弹窗预览里的海报套在 `transform: scale()` 里缩着看，而 html2canvas 按每个节点的 `getBoundingClientRect` 排版，祖先的缩放被照搬了进去。

**处理**：在 html2canvas 的 `onclone` 里把祖先节点的 `transform` 清成 `none`（`clearAncestorTransforms`）——`onclone` 在测量之前执行，改的只是截图用的那份副本，预览不受影响。

**相关文件**：`apps/web/utils/poster.ts`
**记录时间**：2026-09-18

### 8. 下载的海报里文字被裁掉一截（弹窗预览正常）

**现象**：下载下来的 PNG 里，标题、摘要、作者、日期、链接每一行的下半截都没了，像被横向切过一刀；弹窗里的预览是同一份 DOM，却完全正常。

**原因**：html2canvas 1.4.1 量字体基线时用的是**当前页面**的 document，而不是截图用的那份克隆副本（源码里就是 `new FontMetrics(document)`）。它的做法是往 body 末尾临时插一个隐藏容器（一个 span 加一个 1×1 的探针 img），再用 `img.offsetTop - span.offsetTop` 反推基线位置，这依赖两条浏览器默认排版行为，而 Tailwind v4 的 preflight 恰好把两条都改掉了：

1. 探针 img 得是行内元素 —— preflight 写了 `img { display: block }`，探针于是另起一行，`img.offsetTop - span.offsetTop` 量到的是整个行框，而不是基线到行首的那段距离；
2. 那口隐藏容器的高度靠继承 `line-height: normal` 撑出来 —— preflight 在 `html` 上写了 `line-height: 1.5`，行框又比默认高了半行行距。

两个偏差叠加，量到的基线明显偏低（44px 字号实测 67px，还原成浏览器默认排版后是 52px），html2canvas 就照着这个值把文字往下画；海报里每行外面还有一层 `overflow: hidden`，被画低的那部分下半截正好被裁掉（实测文字位置偏低约 19px、像素带比正常矮约 10px）。预览走的是浏览器正常排版，所以看不出问题。

**处理**：截图期间临时往当前文档的 head 补两条规则，把探针容器的排版还原成浏览器默认值，截完立即移除（见 `utils/poster.ts` 的 `TEXT_METRICS_STYLE` / `withDefaultTextMetrics`）：

    body > div[style*='visibility: hidden'] { line-height: normal; }
    body > div[style*='visibility: hidden'] > img { display: inline; }

选择器只命中 html2canvas 那个探针容器，不碰页面上别的图片和文本。两个要点：注入必须落在**当前 document**（在 `onclone` 里给克隆文档的 head 加同样的样式无效，那时基线早就量完了）；这套样式只包住 `renderPosterToCanvas`，预览不走这条路。

这类问题纯属浏览器排版行为，单测环境（vitest 的 `environment: 'node'`，也没装 jsdom）复现不了，只能在真实浏览器里验证：渲染出来后量文字像素带的上下边界，和预期位置逐行比对。

**相关文件**：`apps/web/utils/poster.ts`、`apps/web/components/ArticlePosterCard.vue`
**记录时间**：2026-09-18

## 开发服务器与构建

### 9. 开发环境接口 404

**现象**：浏览器请求 `/api/v1/...` 直接 404，后端本身是好的。

**原因**：h3 匹配 `/api` 前缀路由时会先把 `/api` 剥掉再转发，`target` 只写到 `http://127.0.0.1:3001` 就会转发出错误路径。

**处理**：`nitro.devProxy['/api'].target` 补回 `/api`，即 `http://127.0.0.1:3001/api`，这样 `/api/v1/articles → /v1/articles → http://127.0.0.1:3001/api/v1/articles`。

**相关文件**：`apps/web/nuxt.config.ts`
**记录时间**：2026-09-18

### 10. 每次刷新都打一条 Suspense 实验特性提示

**现象**：控制台反复出现 `<Suspense> is an experimental feature and its API will likely change.`（只是提示，不是报错）。

**原因**：Suspense 边界来自 Nuxt 自身（`nuxt-root.vue` / `nuxt-layout.js`），Vue 这句直接走 `console.info`，绕过了 `app.config.warnHandler`，构建标志也已经内联成 true，没有官方开关。

**处理**：`utils/dev-console.ts` 里按整句精确匹配做过滤，`plugins/suspense-notice.client.ts` 在开发期装上（生产构建 `import.meta.dev` 为 false，空转）。

**相关文件**：`apps/web/utils/dev-console.ts`、`apps/web/plugins/suspense-notice.client.ts`
**记录时间**：2026-09-18

## 单元测试

### 11. 单测里 `import.meta.dev` 恒为 `undefined`，开发分支根本跑不到

**现象**：`pnpm --filter @devshare/web test` 只有 `utils/image.spec.ts` 的「OSS 域名在开发环境返回代理 URL」失败——期望 `/oss-assets/foo/bar`，实收原始 OSS 地址。同一个函数在 `nuxt dev` 里行为完全正常，很容易以为是断言写错了。

**原因**：`import.meta.dev` 不是 Vite 的内置变量（Vite 只提供 `import.meta.env.DEV` / `MODE`），它是 Nuxt 的 Vite 插件在构建时注入并**内联成字面量**的。`vitest.config.ts` 用的是纯 `vitest/config`，没加载 Nuxt 那套插件，于是 `import.meta.dev` 退化成一次普通属性访问，运行时拿到的是 `undefined`——注意**不是 `false`**。所以 `if (import.meta.dev && ...)` 会静默短路，测试看到的是「另一条分支」的结果，既不报错也不提示，只有断言失败这一条线索。

**处理**：别让被单测覆盖的纯函数依赖构建期魔法。两种改法：

1. 把环境开关挪出函数、作为参数传入（推荐，两个分支都能测到）：

```ts
export function toProxyUrl(url: string, dev = true): string {
  if (typeof url !== 'string') return ''
  if (!dev || !url.startsWith(OSS_HOST)) return url
  return url.replace(OSS_HOST, PROXY_PREFIX)
}
```

```ts
expect(toProxyUrl(ossUrl, true)).toBe('/oss-assets/foo/bar')
expect(toProxyUrl(ossUrl, false)).toBe(ossUrl)
```

调用方在 Nuxt 里照旧用 `toProxyUrl(url, import.meta.dev)`——那里 `import.meta.dev` 是内联字面量，不受影响。

2. 业务代码一字不动，在 `vitest.config.ts` 里显式声明这个常量：

```ts
export default defineConfig({
  define: { 'import.meta.dev': 'true' }, // 文本替换：测试将永远走 dev 分支
  test: { environment: 'node', include: ['utils/**/*.spec.ts'] },
})
```

第 2 种改法的代价要说清楚：`import.meta.dev` 被写死成 `true`，测试就永远只走「dev 为真」那条路，而线上构建里它是 `false`。要注意**单测本身不在生产跑**——生产镜像里只有 `nuxt build` 的产物，没有 vitest，测试是跑在 CI 的 `ci` 作业里替线上把关的（见 `.github/workflows/ci.yml`，它 `needs` 在上线流程前面）。写死常量等于让线上真正执行的那条路径没人验：它要是坏了，CI 一路绿灯，只有到了线上才暴露。此外测试的运行时也就和 Nuxt 构建出来的不一致了，将来这个文件里再加依赖 `import.meta.dev` 的逻辑，单测给的都是假绿灯。

（就 `image.ts` 这一个函数而言，损失有限：`dev` 为假时只多执行一行 `return url`，而这一行已经被上面「域名不对原样返回」那条测试覆盖，丢的只是这个条件的**分支**覆盖。但换到逻辑更重的文件里就不能这么算了。）

所以除非代码实在不能动，选第 1 种。

第 10 条的 `plugins/suspense-notice.client.ts` 也读 `import.meta.dev`，只是它没有单测，所以同一个坑没在那儿暴露。

**相关文件**：`apps/web/utils/image.ts`、`apps/web/utils/image.spec.ts`、`apps/web/vitest.config.ts`
**记录时间**：2026-09-18

## 部署与环境变量

### 12. 服务器上改了 NUXT_PUBLIC_SITE_URL 却不生效

**现象**：服务器 `.env.prod` 里把 `NUXT_PUBLIC_SITE_URL` 换成了新域名，重新部署并刷新后，站点里的绝对地址还是旧的——海报二维码扫出来的链接、SSR 输出 HTML 里的 `window.__NUXT__.config.public.siteUrl` 都指着老地址。

**原因**：这个值有两条来路，容易当成一条看。

1. 构建期：CI 构建前端镜像时就把它打进产物（`apps/web/Dockerfile:85` 的 `ARG` / `ENV` → `nuxt build`），上游是 GitHub 仓库变量 `NUXT_PUBLIC_SITE_URL_PROD`（`.github/workflows/ci.yml:149`）。
2. 运行期：`docker-compose.prod.yml:67` 把 `.env.prod` 的值注入容器，Nitro 启动时按 `NUXT_PUBLIC_*` 覆盖 `runtimeConfig.public.siteUrl`，SSR 再把结果写进 HTML 的 `window.__NUXT__.config`；客户端 `useRuntimeConfig()` 读的就是这段（Nuxt 客户端版实现是 `window.__NUXT__?.config`，并没有把值内联进 bundle）。

所以「只改 `.env.prod`」本身是有效的，前提是**容器被重建**：环境变量只在创建容器时注入一次，`docker compose restart` 和只改文件都不会重新注入，看起来就是「没生效」。

真正只在构建期确定的只有 `nuxt.config.ts:99` 的 `i18n.baseUrl`（@nuxtjs/i18n 生成 hreflang 用），要改它得重新构建镜像。

**处理**：先重建容器，再确认注入结果：

```bash
cd /srv/devshare
export DEVSHARE_SHA="$(cat .last-prod)"   # 少这句会报 No such image，见第 13 条
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml exec -T web printenv NUXT_PUBLIC_SITE_URL
```

最后一条打印出新值就说明注入成功了，剩下「页面还是旧的」是缓存：`routeRules` 的 SWR 60s + CDN 60s，等约 2 分钟并刷 CDN。改的是构建期值（`i18n.baseUrl` 之类）时，要先改 GitHub 变量 `NUXT_PUBLIC_SITE_URL_PROD` 再重新触发 main 部署，别让两边长期不一致。

顺带一提，上传文件、图片的绝对地址走的是 api 侧另一个变量 `PUBLIC_API_URL`（`apps/api/src/uploads/uploads.service.ts:43`），改完同样要重建 api 容器。

**相关文件**：`apps/web/Dockerfile`、`apps/web/nuxt.config.ts`、`docker-compose.prod.yml`、`.github/workflows/ci.yml`、`docs/DEPLOY.md`
**记录时间**：2026-09-20

### 13. 服务器上手动 docker compose up 报 No such image: ...:prod-

**现象**：在服务器上手敲 `docker compose ... up -d --no-build web`，报 `Error response from daemon: No such image: crpi-xxxx.cn-guangzhou.personal.cr.aliyuncs.com/devshare/devshare-api:prod-`——标签末尾的 sha 是空的，而且报的是 **api** 的镜像，哪怕命令里只写了 web。

**原因**：`docker-compose.prod.yml:42` / `:60` 的镜像标签是 `prod-${DEVSHARE_SHA}`，而 `DEVSHARE_SHA` 只在 `deploy/deploy.sh:121` 里 `export`，`.env.prod` 里没有它，手动执行时插值成空串，标签就成了 `prod-`。至于为什么动的是 api：`web` 服务有 `depends_on: api`（`docker-compose.yml:152`），compose 解析依赖时也要拿到 api 的镜像。

**处理**：手动跑就自己带上这个变量（值取上一次成功部署的 sha，即 `.last-prod`；该文件不存在时用 `docker image ls | grep devshare-web` 看现有标签）：

```bash
cd /srv/devshare
export DEVSHARE_SHA="$(cat .last-prod)"
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
```

只想重建 web 就在末尾加 `web --no-deps`（api 得已经在跑）；对应镜像本地还没拉过时先 `... pull web api`。更省事的是走脚本，它自己导出 sha、拉镜像、做健康检查、失败自动回滚：`bash deploy/deploy.sh prod "$(cat .last-prod)" --no-migrate`。

**相关文件**：`docker-compose.prod.yml`、`docker-compose.staging.yml`、`deploy/deploy.sh`
**记录时间**：2026-09-20

## 追加模板

```md
### N. 一句话说清现象

**现象**：
**原因**：
**处理**：
**相关文件**：
**记录时间**：YYYY-MM-DD
```
