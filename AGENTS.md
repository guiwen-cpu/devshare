# AGENTS.md

DevShare（技享）monorepo：Nuxt 4 前端 + NestJS 后端 + PostgreSQL / Redis / Meilisearch。
本文件是整个仓库的协作约定；若某子目录另有 `AGENTS.md`，以更深层的为准。

## 环境与命令

- 所有 shell 命令加 `rtk` 前缀；输出不可用时用 `rtk proxy <cmd>` 取原始输出（细节见全局 AGENTS.md 引入的 `~/.codex/RTK.md`）。
- Windows + PowerShell：读文件用 `Get-Content -Encoding UTF8`，搜索用 `Select-String -LiteralPath`（路径含 `[` `]` 时必须用 `-LiteralPath`，如 `pages/article/[id].vue`）。不要依赖 `bash` / `cat`。
- 相关命令尽量合并到一次调用，减少往返。

仓库根执行的常用命令：

| 目的          | 命令                                              |
| ------------- | ------------------------------------------------- |
| 安装依赖      | `pnpm install`                                    |
| 起依赖服务    | `docker compose up -d postgres redis meilisearch` |
| 迁移 / 种子   | `pnpm db:migrate` / `pnpm db:seed`                |
| 同时起前后端  | `pnpm dev`（web 3000 / api 3001）                 |
| 全部测试      | `pnpm test`                                       |
| 前端测试      | `pnpm --filter @devshare/web test`                |
| 后端测试      | `pnpm --filter @devshare/api test`                |
| 前端类型检查  | `pnpm --filter @devshare/web exec nuxt typecheck` |
| 后端类型检查  | `pnpm --filter @devshare/api lint`                |
| 格式化 / 校验 | `pnpm format` / `pnpm format:check`               |

## 验证要求

- 改前端逻辑：至少跑 `pnpm --filter @devshare/web test`；动了类型或公共 API 再跑 `nuxt typecheck`。
- 改后端：跑 `pnpm --filter @devshare/api test`；动 Prisma schema 要跟迁移。
- 先跑最贴近改动的窄测试，再逐步扩大。不要顺手修无关的失败，发现后口头说明即可。
- `docs/DESIGN.md` 的表格当前 `prettier --check` 不通过（HEAD 上也不通过），除非任务就是改它，否则不要重排。

## 代码约定

- 前端 Nuxt 4 + Vue 3 + TS，**手写 Tailwind，没有组件库**；优先复用 `apps/web/components/` 里已有的 `Base*` 原子组件，不要另起一套。
- 视觉以 `docs/DESIGN.md` 为准：颜色走 `@theme` token（`brand-500`、`accent-500` 等），字体栈和字号沿用该文档，不要引入新的设计体系。
- 文案改动必须同时更新 `apps/web/i18n/locales/zh.json` 和 `en.json`，两边 key 保持一致。
- 纯函数放 `apps/web/utils/*.ts`，测试与实现同目录同名（`poster.ts` ↔ `poster.spec.ts`，Vitest）。
- 格式由 Prettier 决定：无分号、单引号、`printWidth 100`、`trailingComma all`、2 空格、LF、UTF-8。
- **海报相关（`ArticlePosterCard` / `utils/poster.ts`）**：海报节点内不能用 Tailwind 颜色类 —— Tailwind v4 调色板是 `oklch()`，html2canvas 解析不了会直接抛错，颜色一律内联 hex；折行在 JS 里算好（html2canvas 不支持 `-webkit-line-clamp`）；预览套了 `transform: scale()`，截图时要在 html2canvas 的 `onclone` 里清掉祖先 transform。

## 设计新页面 / 新组件

**新增页面、组件，或做视觉改版之前，先加载 `frontend-design` 技能**（个人技能，见 `~/.agents/skills/frontend-design/SKILL.md`），并按它的两段式流程走：先产出一份紧凑的设计方案（4–6 个具名色值、字体与角色、布局概念含 ASCII 线框、几条原则），对照需求复核掉"换成别的项目也成立"的通用默认部分，再动手写代码。

它同时是一份禁用清单，本仓库照此执行：标题里只给一个词换色或斜体、无谓的全大写标签和 eyebrow 小标签、非序列内容套 01/02/03、满页 fade-and-slide 入场和逐卡片 hover 动画、装饰性渐变。`docs/DESIGN.md` 里已经定下的品牌方向优先于技能里的通用建议。

## Git

- **除非明确要求，不要 `git commit`，也不要新建分支。**
- 提交信息遵循 `docs/GIT_CONVENTION.md`（Conventional Commits，`<type>(<scope>): <subject>`，中文描述、末尾不加句号）；`husky` + `commitlint` 会拦截不合规的信息。
- `pre-commit` 由 `lint-staged` 自动对暂存文件跑 prettier + eslint；`pnpm-lock.yaml` 在 `.prettierignore` 里，不要格式化。

## 文档

行为、接口或配置有变化时，同步更新对应文档：`README.md`、`docs/DESIGN.md`（组件与视觉）、`docs/LOCAL_DEV.md`（本地启动与排错）、`docs/DEPLOY.md`（部署）。
