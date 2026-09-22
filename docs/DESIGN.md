# DevShare（技享）设计规范

## 1. 品牌

- 品牌名：**DevShare（技享）**（占位，可替换）
- 定位：面向开发者的技术内容社区
- 标语：中文「技术内容社区」/ 英文 "Developer Content Community"

## 2. 色彩（Tailwind v4 @theme tokens）

| Token          | 值                     | 用途                         |
| -------------- | ---------------------- | ---------------------------- |
| `brand-500`    | `#2F6BFF`              | 主色：链接、主按钮、选中态   |
| `brand-50/100` | `#EEF4FF/#D9E6FF`      | 浅色背景、标签底             |
| `accent-500`   | `#00C2A8`              | 强调色：写文章按钮、品牌渐变 |
| `bg`           | `#F7F8FA`              | 页面背景                     |
| `text`         | `#0F172A`（slate-900） | 正文/标题                    |
| 中性色         | slate 系列             | 边框、次要文字、hover        |

规则：v1 仅浅色主题；品牌渐变 `from-brand-500 to-accent-500` 用于 Logo 与视觉点缀。

## 3. 字体与排版

- 字体栈：`Inter, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui`
- 代码字体：`JetBrains Mono, SFMono-Regular, Consolas`
- 正文 16px / 行高 1.8；标题层级用粗体 + 字号区分；长文排版见 `.prose-content`。

## 4. 组件规范（手写 Tailwind，无组件库）

| 组件                                                          | 说明                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| BaseButton                                                    | primary / secondary / ghost / danger × sm / md / lg，loading / disabled                                          |
| BaseInput / BaseTextarea / BaseSelect                         | 表单控件，聚焦 ring 反馈，错误态                                                                                 |
| BaseModal                                                     | 遮罩 + 居中卡片 + Esc 关闭                                                                                       |
| BaseDropdown                                                  | 点击触发 + 点击外部关闭                                                                                          |
| BaseTabs                                                      | 下划线式 tab                                                                                                     |
| BaseToast                                                     | 顶部居中消息，3.2s 自动消失                                                                                      |
| BaseAvatar / BaseTag / BaseSkeleton / BaseSpinner / BaseEmpty | 展示类原子组件                                                                                                   |
| ArticlePosterDialog / ArticlePosterCard                       | 文章海报：DOM 排版 750×1120 版面（页脚放文章二维码），弹窗直接预览海报 DOM，下载时才用 html2canvas 截成 2 倍 PNG |
| ArticleCard                                                   | 信息流卡片，**固定高度 144px**（虚拟滚动前提）                                                                   |
| VirtualFeed                                                   | TanStack Virtual 封装，SSR 首屏直出前 12 条，客户端激活后虚拟化                                                  |
| HotRank                                                       | 热门榜，前三名彩色角标                                                                                           |
| CourseCard                                                    | 课程卡片：16:9 封面（无图用渐变兜底）、角标、标题与摘要各 2 行截断、难度与报名人数                               |
| HomeCourses                                                   | 首页「精品课程」板块：分类 tab（推荐 + 动态分类）+ 3×2 网格 + 「加载更多」（切 tab 重置游标）                    |
| HomeCourseCategories                                          | 右栏「热门方向」：课程分类 + 已上架课程数，点击与左侧课程 tab 双向联动                                           |
| HomeBanner                                                    | 首页顶部 Banner 轮播，内容全部来自后台配置（标题 / 副标题 / 图片 / 跳转地址）；无启用项时整块不渲染              |
| /admin/banners                                                | 首页 Banner 管理：增删改查、排序值、启用停用，图片上传复用 /uploads（建议 1600×600）                             |
| 课程详情页 /courses/:id                                       | 封面 + 标题 + 讲师卡 + 适合人群 + 课程简介 + 侧栏报名卡（公益免费，一键报名）                                    |

## 5. 交互与体验

- 信息流：进入即 SSR 首屏 → 客户端虚拟滚动 + 触底加载更多；
- 互动（点赞/收藏/关注）：乐观更新 + Toast 反馈；未登录点击跳转登录；
- 课程报名：全部课程为公益免费课程，登录后点击即报名，不涉及支付与金额；取消报名保留记录并置为 `canceled`，报名人数按有效记录实时统计；未登录点击报名跳转登录。
- 首页 Banner：内容与顺序完全由后台 `/admin/banners` 决定，整张幻灯片是一个链接（站内路径带语言前缀，外链新窗口打开），5s 自动切换且悬停 / 聚焦即暂停，`prefers-reduced-motion` 下不自动播放；右下分段进度轨兼任「当前第几张」与「距离自动切换还剩多久」，图片加载失败退回品牌渐变打底；
- 语言切换：顶栏下拉，保存到 `df_locale` cookie，URL `/zh` `/en` 前缀；
- 图片：懒加载 + 封面缩略图，上传 ≤ 5MB 且仅图片。
- 分享海报：文章详情一键生成海报（品牌色带 + 封面 + 标题摘要 + 标签 + 作者），弹窗内直接预览海报 DOM（按容器等比缩放），点下载才用 html2canvas 把这份预览截成 2 倍 PNG；
  版面用 DOM / CSS 排（组件 `ArticlePosterCard`），截图交给 html2canvas，封面/头像取不到时退化为占位图形，保证海报始终能导出；
  预览是套在 `transform: scale()` 里缩着看的，截图时要在 html2canvas 的 onclone 里把祖先 transform 抹掉，否则整张海报会被缩到画布角落（详见 `utils/poster.ts`）；
  海报节点内不能用 Tailwind 颜色类 —— Tailwind v4 调色板是 oklch，html2canvas 解析不了会直接抛错，颜色一律走内联 hex；折行也在 JS 里算好（html2canvas 不支持 `-webkit-line-clamp`）。
  页脚二维码是文章完整地址（带协议头），用 `qrcode` 生成 PNG data URL 后当普通图片放进海报节点 —— data URL 不跨域、不污染画布，和封面/头像同一套逻辑；码旁标注扫码提示与链接，生成失败就退化成只显示链接；
  二维码每个模块的像素数取整，导出又是 2 倍图，一个模块正好落在整数设备像素上，放大不糊边；静默区不画在图里，交给页脚白卡的留白提供。
