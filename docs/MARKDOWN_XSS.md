# 文章正文的 XSS 防线：Markdown 渲染 + 白名单净化

> 一句话：**正文 HTML 只在服务端渲染一次**——markdown-it 关掉原始 HTML 渲染成 HTML，再用 `xss` 白名单净化，净化结果落库；前端全站只有一个 `v-html`，喂给它的就是这份已净化的 HTML。
>
> 核心实现只有 [markdown.util.ts](../apps/api/src/articles/markdown.util.ts) 一个 52 行的文件。

## 1. 全链路：渲染在写入时，读取时直出

Markdown → HTML 的转换不在读取时做，而是在**创建 / 更新文章时做一次**，结果与原文一起落库：

```
【写入】POST /api/v1/articles  (create-article.dto.ts 白名单校验)
            │
            ├─ contentMd    ──────────────────────────► articles.contentMd    (原文，留着给编辑器回填)
            │
            └─ renderMarkdown(contentMd)                                      ← 唯一的净化入口
                     │
                     │  ① markdown-it: html:false  → 原始 HTML 全部转义成文本
                     │  ② xss(whiteList)           → 标签/属性白名单过滤
                     ▼
                 contentHtml  ─────────────────────────► articles.contentHtml  (已净化，直接可渲染)

【读取】GET /api/v1/articles/:id
            └─ toDetail() 原样返回 contentMd + contentHtml，**不再做任何处理**

【渲染】apps/web/pages/article/[id].vue
            └─ <div v-html="assetHtml(article.contentHtml)" />   ← 全站唯一的 v-html
```

| 环节              | 位置                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DTO 字段校验      | [create-article.dto.ts](../apps/api/src/articles/dto/create-article.dto.ts)                                                                                 |
| 写入时渲染 + 净化 | [articles.service.ts:138](../apps/api/src/articles/articles.service.ts#L138)（create）、[:171](../apps/api/src/articles/articles.service.ts#L171)（update） |
| 净化函数本身      | [markdown.util.ts](../apps/api/src/articles/markdown.util.ts)                                                                                               |
| 落库字段          | [schema.prisma:39-40](../apps/api/prisma/schema.prisma#L39-L40)                                                                                             |
| 读取时直出        | [articles.service.ts:305-306](../apps/api/src/articles/articles.service.ts#L305-L306)                                                                       |
| 前端唯一 `v-html` | [\[id\].vue:267-269](../apps/web/pages/article/%5Bid%5D.vue#L267-L269)                                                                                      |

**为什么在写入时做**：读接口（详情、列表、搜索、榜单）是热点，每个人读一篇文章都要渲染一次的话，CPU 白烧；而写只发生在作者点"保存"那一刻。代价是**渲染逻辑与已存数据绑定**——改了白名单或 markdown-it 配置，老文章不会自动重新净化，需要手动重刷 `contentHtml`。

## 2. 第一道：markdown-it 关掉原始 HTML（`html: false`）

这是**当前真正挡住攻击的那一道**，而不是白名单：

```ts
const md = new MarkdownIt({
  html: false, // ← 关键：正文里的原始 HTML 不作为标签解析，全部转义成实体
  linkify: true, // 裸 URL 自动变成 <a>
  breaks: true, // 单个换行 → <br>
  typographer: true, // 弯引号、破折号等排版替换
})
```

因为 `html: false`，`<script>alert(1)</script>` 在**还没轮到 `xss` 之前**就已经被转义成 `&lt;script&gt;...` 了。实测：

```
IN : "<script>alert(1)</script>"
OUT: "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
```

`img onerror`、`onclick`、`<iframe>`、`<svg onload>`、`<style>`、`<form>` 无一例外，全部退化成一段**可见的纯文本**——用户看到的是自己输入的标签原文，而不是被执行。

`linkify: true` 还会把这段文本里的 URL 自动变成链接，所以 `<iframe src="https://evil.com">` 的输出是这样的（URL 被链接化了，但整体仍在转义后的文本里）：

```
OUT: "<p>&lt;iframe src=“<a href=\"https://evil.com\">https://evil.com</a>”&gt;&lt;/iframe&gt;</p>"
```

另外 `typographer: true` 会把正文里的直引号换成弯引号 `“ ”`——上例里的 `src="` 变成了 `src=“`，这是排版特性，不是转义，别误读成净化结果。

## 3. 第二道：`xss` 标签 / 属性白名单

```ts
const whiteList = {
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [], // 六级标题：一律不带属性
  p: [],
  br: [],
  hr: [],
  strong: [],
  em: [],
  b: [],
  i: [],
  del: [],
  s: [],
  ul: [],
  ol: [],
  li: [],
  a: ['href', 'title', 'target', 'rel'], // 链接：保留跳转与目标窗口
  code: ['class'], // 代码：class 用来带语言标记 language-js
  pre: [],
  blockquote: [],
  img: ['src', 'alt', 'title', 'loading'],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['align'],
  td: ['align'], // 表格对齐
  input: ['disabled', 'type', 'checked'], // 见 §8：markdown-it 默认并不产出 input
  span: ['class'],
}

export function renderMarkdown(contentMd: string): string {
  const raw = md.render(contentMd)
  return xss(raw, {
    whiteList,
    stripIgnoreTag: true, // 不在白名单的标签：剥掉标签本身，保留内部文本
    allowCommentTag: false, // HTML 注释整体丢弃
  })
}
```

三个选项的含义：

| 选项              | 取值      | 作用                                                                             |
| ----------------- | --------- | -------------------------------------------------------------------------------- |
| `whiteList`       | 22 个标签 | **默认拒绝**：没列出的标签一律不放行；列出的标签只有列出的属性存活               |
| `stripIgnoreTag`  | `true`    | 不在白名单的标签剥壳留肉：`<iframe>inner</iframe>` → `inner`（否则整段保留原文） |
| `allowCommentTag` | `false`   | 丢弃 `<!-- ... -->`，防止条件注释之类的老花招                                    |

这正是"默认拒绝"（deny by default）原则：**新增加一个标签是显式动作，漏配一个标签不会变成漏洞**。

## 4. 第三道：`xss` 库自带的属性级协议过滤

白名单只决定"这个属性能不能留"，属性的**值还会再过一遍** `xss` 内置的 `safeAttrValue`（见 `node_modules/xss/lib/default.js`）。对 `href` / `src`，只放行这些前缀：

```
http://   https://   mailto:   tel:   ftp://   data:image/   ./   ../   /   #
```

其余一律替换为空串。也就是说，即使某个属性侥幸留在了白名单里，`href="javascript:alert(1)"` 也会被清成 `href=""`。

**这一道在当前配置下几乎用不上**——因为第一道已经把关了。它的价值在于`html: true` 万一被谁打开的兜底，以及 attribute 值里带引号逃逸的情况。所以它是"纵深防御"，不能当成主力。

还有一道可以独立算作 Markdown 层的过滤：**markdown-it 自己的 `validateLink`** 会拒绝 `javascript:` / `vbscript:` / `file:` / `data:`（`data:image/*` 除外）的链接目标，这类链接干脆**不被渲染成链接**，原样留在文本里：

```
IN : "[点我](javascript:alert(1))"
OUT: "<p>[点我](javascript:alert(1))</p>"      ← 没有生成 <a>
```

## 5. 前端：全站只有一个 `v-html`，且不做二次加工

前端**没有引入任何 Markdown 渲染库**（`apps/web/package.json` 里没有 markdown-it / marked），写入页 [write/index.vue](../apps/web/pages/write/index.vue)、[write/\[id\].vue](../apps/web/pages/write/%5Bid%5D.vue) 只有 `<textarea v-model="form.contentMd">`，**没有预览面板**。这是好事：没有第二套渲染器，就不存在"两套渲染器的净化规则不一致"这个经典漏洞来源。

唯一的渲染点是文章详情页：

```vue
<!-- contentHtml 已由后端 markdown 渲染后经 xss 白名单清洗，见 apps/api/src/articles/markdown.util.ts -->
<!-- eslint-disable-next-line vue/no-v-html -->
<div class="prose-content" v-html="assetHtml(article.contentHtml)" />
```

这里的 `assetHtml` 是 [useAssetUrl.ts](../apps/web/composables/useAssetUrl.ts) 提供的 OSS 图片地址改写，它**只做字符串替换，不解析也不构造 DOM**：

```ts
return html.replace(
  /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi,
  (_m, head, src, tail) => head + ossImageUrl(src, enabled) + tail,
)
```

替换只发生在**已经净化过的 HTML 上**，且只改 `src` 的取值（追加 `?x-oss-process=...`）、不新增节点，因此不会重新引入注入面。注意它是**读取时**做的，所以 `/uploads/` 的判断依据是库里存的原始地址，而不是净化后的 HTML。

其余所有用户内容都走 Vue 的文本插值（自动转义），例如评论正文是 `{{ comment.content }}`（[\[id\].vue:322](../apps/web/pages/article/%5Bid%5D.vue#L322)），评论根本不经过 Markdown 渲染，也就不需要净化。

## 6. 实测载荷对照表

以下结果由真实管线（`markdown-it@14` + `xss@1.0.15` + 上面的白名单与选项）跑出，可作为回归基准：

| 输入                                       | 输出                                                        | 结论               |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------ |
| `<script>alert(1)</script>`                | `<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`              | 转义为文本         |
| `<img src=x onerror=alert(1)>`             | `<p>&lt;img src=x onerror=alert(1)&gt;</p>`                 | 转义为文本         |
| `<div onclick="alert(1)">click</div>`      | `<p>&lt;div onclick=“alert(1)”&gt;click&lt;/div&gt;</p>`    | 转义为文本         |
| `<svg onload=alert(1)></svg>`              | `<p>&lt;svg onload=alert(1)&gt;&lt;/svg&gt;</p>`            | 转义为文本         |
| `<iframe src="https://evil.com"></iframe>` | 转义 + 其中 URL 被 linkify 成 `<a>`                         | 无自动加载         |
| `<form action="https://evil.com">…</form>` | 转义为文本（含一个 `https` 链接）                           | 无钓鱼表单         |
| `<!-- <script>alert(1)</script> -->`       | `<p>&lt;!-- &lt;script&gt;…--&gt;</p>`                      | 注释被转义         |
| `<ScRiPt>alert(1)</ScRiPt>`                | 转义为文本                                                  | 大小写无差别       |
| `<scr<script>ipt>alert(1)</script>`        | 转义为文本                                                  | 嵌套畸形标签无效   |
| `[点我](javascript:alert(1))`              | `<p>[点我](javascript:alert(1))</p>`                        | 不渲染成链接       |
| `[点我](data:text/html;base64,…)`          | `<p>[点我](data:text/html;base64,…)</p>`                    | 不渲染成链接       |
| `[点我](https://example.com)`              | `<p><a href="https://example.com">点我</a></p>`             | 正常链接           |
| `[x](//evil.com)`                          | `<p><a href="//evil.com">x</a></p>`                         | **放行**，见 §8    |
| `![图](/uploads/a.png)`                    | `<p><img src="/uploads/a.png" alt="图"></p>`                | 正常图片           |
| `![x](data:image/png;base64,iVBORw0KGgo=)` | `<p><img src="data:image/png;base64,…" alt="x"></p>`        | **放行**，见 §8    |
| `![图](/uploads/a.png" onerror="alert(1))` | `<p>![图](/uploads/a.png&quot; onerror=&quot;alert(1))</p>` | 引号逃逸失败       |
| ` ```js … ``` `                            | `<pre><code class="language-js">…</code></pre>`             | 语言 class 保留    |
| `~~deleted~~`                              | `<p><s>deleted</s></p>`                                     | 删除线             |
| `> 引用`                                   | `<blockquote><p>引用</p></blockquote>`                      | 引用               |
| `\| a \| b \| …`                           | `<table>…</table>`                                          | 表格               |
| `- [ ] todo`                               | `<ul><li>[ ] todo</li></ul>`                                | 任务列表语法不生效 |

**测试**：`renderMarkdown` 的净化行为在 [articles.service.spec.ts:8-15](../apps/api/src/articles/articles.service.spec.ts#L8-L15) 有断言，`pnpm --filter @devshare/api test` 可跑：

```ts
it('渲染并净化 markdown（去掉原始 HTML）', () => {
  const html = renderMarkdown('# Hello\n\n<script>alert(1)</script>\n\n**bold**')
  expect(html).toContain('<h1>Hello</h1>') // 正常语法照常渲染
  expect(html).toContain('<strong>bold</strong>')
  expect(html).not.toContain('<script>') // 危险标签必须消失
})
```

安全逻辑必须带测试——否则哪天有人把 `html` 改成 `true`、或者把白名单换成 `xss.getDefaultWhiteList()`，代码照样能跑，漏洞却悄悄开了。

## 7. 相邻战场的同类防线

正文之外的几个输入口用的是别的机制，别混淆：

| 输入            | 处理方式                                                                 | 位置                                                                        |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 图片 / 视频上传 | MIME 白名单，**明确不收 SVG**——SVG 是能执行脚本的 XML，属存储型 XSS 入口 | [shared/index.ts:359-370](../packages/shared/src/index.ts#L359-L370)        |
| 评论正文        | 纯文本，不经 Markdown，前端 `{{ }}` 插值自动转义                         | [\[id\].vue:322](../apps/web/pages/article/%5Bid%5D.vue#L322)               |
| 标题 / 简介     | DTO 长度与类型校验，前端文本插值                                         | [create-article.dto.ts](../apps/api/src/articles/dto/create-article.dto.ts) |
| JSON 请求体     | `ValidationPipe({ whitelist: true })` 剥掉 DTO 未声明的字段              | [main.ts:28-34](../apps/api/src/main.ts#L28-L34)                            |
| API 响应头      | `helmet()` 设置安全响应头                                                | [main.ts:23](../apps/api/src/main.ts#L23)                                   |

## 8. 已知缺口与注意事项

读这份代码时值得知道的几件事，按重要性排序：

1. **渲染 HTML 的那一端没有 CSP。** `helmet()` 装在 NestJS 上，只作用于 API 响应；文章页是 Nuxt 渲染、经 nginx 下发（[deploy/nginx.conf](../deploy/nginx.conf)），那里没有任何 `Content-Security-Policy` / `add_header` 安全头。也就是说，净化是"唯一"防线而非"第一层"防线，一旦净化被绕过就是无遮挡执行。补一条只允许同源脚本、不允许 `unsafe-inline` 的 CSP 是最划算的加固。
2. **白名单比 markdown-it 实际产出宽。** `input`、`span`、`img` 的 `loading`、`a` 的 `target` / `rel` 在当前配置下都不会被 markdown-it 生成（实测见 §6），属于"死放行"。风险在于：将来若有人把 `html: true` 打开，`input: ['disabled', 'type', 'checked']` 会放行 `<input type="password">`——足以仿冒登录框。**开 `html: true` 之前必须先收紧这条。**
3. **`//evil.com` 这类协议相对链接会被放行**（`xss` 的 `safeAttrValue` 允许以 `/` 开头）。不是 XSS，但可用于钓鱼跳转。同理 `![x](data:image/png;base64,…)` 也照常渲染——若要更严，可在白名单外再加一层 URL 域名校验。
4. **[seed.ts:342](../apps/api/prisma/seed.ts#L342) 直接拼 `contentHtml`，绕过了净化**。只是本地种子脚本、内容自身可控，不构成漏洞，但别照着它的写法往业务代码里抄。
5. **改动渲染逻辑不会重刷老数据**，因为 `contentHtml` 是写入时落库的（§1）。改了白名单或 markdown-it 配置，要额外做一次重刷：读出所有 `contentMd` → 重新 `renderMarkdown` → 回写 `contentHtml`。
6. **将来若要做编辑器实时预览，必须复用同一套净化，且最好把净化挪到可共享的位置。** 前端一旦自己接一个 markdown 库预览、又不净化，或者净化规则与后端不一致，就会直接制造 XSS。当前"前端零渲染、无预览"是安全的简化，改它要有意识地改。
7. **`typographer: true` 会改写正文里的直引号**（`"` → `“”`），影响的是代码块外的普通文本；写文档和写文章时遇到过"引号变了"的现象，原因在这里。

## 9. 改动这份白名单时的检查清单

- [ ] 新增标签前先问：markdown-it 现在会产出它吗？不会产出却放进白名单，就是白送攻击面。
- [ ] 新增属性时同样要过一遍 `xss` 的 `safeAttrValue` 协议清单（§4），`href` / `src` 之外的属性没有这层保护。
- [ ] 永远不要动 `html: false`；确实需要内联 HTML 时，改为收紧白名单并把 `html: true` 当作一次完整的安全评审来做。
- [ ] 改完跑 `pnpm --filter @devshare/api test`，并手动过一遍 §6 的载荷表（`<script>` 与 `onerror` 两条是底线）。
- [ ] 考虑老数据的重刷（§8 第 5 条）。

## 10. 代码索引

| 文件                                                                                                | 作用                                                     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [apps/api/src/articles/markdown.util.ts](../apps/api/src/articles/markdown.util.ts)                 | markdown-it 实例 + 白名单 + `renderMarkdown()`，全部逻辑 |
| [apps/api/src/articles/articles.service.ts](../apps/api/src/articles/articles.service.ts)           | 写时调用净化、读时直出 `contentHtml`                     |
| [apps/api/src/articles/articles.service.spec.ts](../apps/api/src/articles/articles.service.spec.ts) | 净化行为的回归测试                                       |
| [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma)                                   | `contentMd` / `contentHtml` 两个字段的用途区分           |
| [apps/web/pages/article/\[id\].vue](../apps/web/pages/article/%5Bid%5D.vue)                         | 全站唯一的 `v-html`，带注释指向净化实现                  |
| [apps/web/composables/useAssetUrl.ts](../apps/web/composables/useAssetUrl.ts)                       | 渲染前的 OSS 图片地址改写（只改 `src`，不新增节点）      |
| [packages/shared/src/index.ts](../packages/shared/src/index.ts)                                     | 上传 MIME 白名单（不含 SVG）等同类信任边界               |
| [deploy/nginx.conf](../deploy/nginx.conf)                                                           | 页面下发的入口，当前无 CSP                               |

> 配套阅读：[BACKEND_GUIDE.md 第 11 章「安全」](BACKEND_GUIDE.md) 从后端视角列了全项目的威胁与防线。
