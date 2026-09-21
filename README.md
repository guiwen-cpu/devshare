# DevShare（技享）开发者技术分享社区（monorepo）

从 0 到 1 实现的技术内容社区：Vue 3 + Nuxt 4（SSR）+ NestJS + PostgreSQL + Redis + Meilisearch，Docker 容器化部署，面向国内云 + CDN 上线。22

## 技术栈

| 层   | 选型                                                                                     |
| ---- | ---------------------------------------------------------------------------------------- |
| 前端 | Nuxt 4（Vue 3 + Vite + TS）、Tailwind CSS v4、vue-i18n、TanStack Query、TanStack Virtual |
| 后端 | NestJS 11、Prisma ORM                                                                    |
| 数据 | PostgreSQL 16（主库）、Redis 7（缓存/计数/刷新令牌）、Meilisearch（搜索）                |
| 部署 | Docker Compose、Nginx、阿里云（ECS + OSS + CDN + ACR）、Let's Encrypt                    |

## 目录结构

```
apps/
  web/    # Nuxt 前端（SSR 首页 + 文章详情，其余 SPA）
  api/    # NestJS 后端（/api/v1）
packages/
  shared/ # 共享 TS 类型与常量
deploy/   # Nginx 配置
docs/     # PRD、设计规范、部署手册
```

## 本地开发

要求：Node ≥ 22.12、pnpm ≥ 10。若本机用 nvm-windows，在**管理员终端**执行 `nvm use 22.14.0` 切换（本文档开发时安装于 `D:\node22` 亦可直接使用）。

```powershell
# 0.（Windows）让终端使用 Node 22（若 `node -v` 仍是 v16）
$env:Path = 'D:\node22;' + $env:Path
node -v   # 应输出 v22.x

# 1. 安装依赖
pnpm install

# 2. 准备环境变量（先复制 .env，再启动容器）
# PowerShell 用 Copy-Item，Git Bash 用 cp
Copy-Item .env.example .env                          # 仓库根目录环境变量
Copy-Item apps/api/.env.example apps/api/.env        # API 本地环境变量（已 gitignore）
# cp .env.example .env
# cp apps/api/.env.example apps/api/.env

# 注意：如果修改了根 .env 里的 POSTGRES_PASSWORD，
# 必须同步修改 apps/api/.env 里 DATABASE_URL 的密码，否则数据库认证失败

# 3. 启动依赖（PostgreSQL / Redis / Meilisearch）
docker compose up -d postgres redis meilisearch
docker compose ps   # 三个服务都应为 running

# 4. 初始化数据库
pnpm --filter @devshare/api prisma:migrate
pnpm --filter @devshare/api prisma:seed

# 5. 同时启动前后端（web: 3000 / api: 3001）
pnpm dev
```

浏览器本地访问 `http://localhost:3000`，API 文档在 `http://localhost:3001/api/docs`。

线上访问：https://devshare.cfd

常用脚本：

- `pnpm dev` — 并行启动 web + api
- `pnpm build` — 构建 shared + api + web
- `pnpm test` — 后端 Jest + 前端 Vitest
- `pnpm db:migrate` / `pnpm db:seed` — 数据库迁移与种子数据
- `pnpm docker:up` — 一键构建并启动全部容器

## API 文档

本地启动 api 后访问 `http://localhost:3001/api/docs`（Swagger UI）。

## 部署

阿里云部署全流程（域名、备案、ECS、OSS、CDN、ACR）见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 文档

- [需求分析 PRD](docs/PRD.md)
- [设计规范（品牌/组件）](docs/DESIGN.md)
- [本地开发启动指南](docs/LOCAL_DEV.md)
- [开发问题汇总（踩坑记录）](docs/PITFALLS.md)
- [部署手册](docs/DEPLOY.md)
