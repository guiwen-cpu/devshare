# 本地开发环境启动指南

> 适用对象：DevShare（技汇）monorepo 的新手开发者
> 目标：在一台新电脑上，从零把前端 + 后端 + 数据库全套跑起来

## 1. 整体架构：本地要跑什么

本地开发一共运行 5 个东西，分为两类：

| 类别                    | 组件            | 端口 | 作用                       |
| ----------------------- | --------------- | ---- | -------------------------- |
| 基础设施（Docker 容器） | PostgreSQL      | 5432 | 主数据库，存用户/文章/评论 |
| 基础设施（Docker 容器） | Redis           | 6379 | 缓存、计数、登录态         |
| 基础设施（Docker 容器） | Meilisearch     | 7700 | 全文搜索                   |
| 应用（本机进程）        | API（NestJS）   | 3001 | 后端接口，Swagger 文档在此 |
| 应用（本机进程）        | Web（Nuxt SSR） | 3000 | 前端网站                   |

关系一句话：浏览器访问 `3000`（前端）→ 前端调用 `3001`（后端）→ 后端读写三个容器。

## 2. 环境要求（一次性准备）

| 软件           | 最低版本     | 检查命令           |
| -------------- | ------------ | ------------------ |
| Node.js        | 22.12+       | `node -v`          |
| pnpm           | 10+          | `pnpm -v`          |
| Docker Desktop | 最新稳定版   | 打开后等待引擎变绿 |
| Git            | 任意较新版本 | `git --version`    |

本项目开发时安装的 Node 22 位于 `D:\node22`。若 `node -v` 显示的还是 v16，每次新开终端先执行：

```powershell
# PowerShell
$env:Path = 'D:\node22;' + $env:Path
node -v   # 应输出 v22.x
```

```bash
# Git Bash
export PATH="/d/node22:$PATH"
node -v
```

> 注意：该命令只对当前终端窗口生效，新开终端需要重新执行。

## 3. 第一次启动（完整流程）

### 第 1 步：安装依赖

```powershell
pnpm install
```

安装完成后会自动执行 `postinstall` 脚本（构建 shared 共享包 + nuxt prepare），看到成功提示即可继续。

### 第 2 步：准备环境变量文件

仓库根目录和 `apps/api` 下各需要一份 `.env`。刚克隆的仓库只有 `.env.example`，需要复制一份：

```powershell
# PowerShell
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
```

```bash
# Git Bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

**⚠️ 最重要的一个坑**：根目录 `.env` 的 `POSTGRES_PASSWORD` 与 `apps/api/.env` 中 `DATABASE_URL` 里的密码必须一致。

- 根 `.env` 的密码：docker 创建 postgres 容器时设置的密码（上锁的密码）
- `DATABASE_URL` 里的密码：API 连接数据库时出示的密码（开锁的密码）

两边不一致会报 `P1000: Authentication failed`。新手阶段建议直接沿用 `.env.example` 默认值，不要改。

### 第 3 步：启动数据库容器

```powershell
docker compose up -d postgres redis meilisearch
docker compose ps
```

`docker compose ps` 显示三个服务都是 `running` 再继续。首次拉取镜像需要几分钟，取决于网速。

> 如果报 `docker: command not found`：先打开 Docker Desktop，等待引擎就绪（左下角变绿），然后重开一个终端再试。

### 第 4 步：初始化数据库

```powershell
pnpm --filter @devshare/api prisma:migrate
pnpm --filter @devshare/api prisma:seed
```

- `prisma:migrate`：按数据模型建表（把货架搭好）
- `prisma:seed`：写入演示数据（把商品摆上货架）

也可以用根目录快捷命令：`pnpm db:migrate`、`pnpm db:seed`。seed 脚本可重复执行，不会重复插入。

### 第 5 步：同时启动前后端

```powershell
pnpm dev
```

看到两个服务都输出 listening 即可访问：

| 地址                           | 说明                 |
| ------------------------------ | -------------------- |
| http://localhost:3000          | 前端网站（首页 SSR） |
| http://localhost:3001/api/docs | Swagger 接口文档     |

### 第 6 步：登录体验完整链路

用种子账号登录：

```
邮箱：admin@devshare.dev
密码：password123
```

登录后可以写文章、发布、点赞、收藏、评论，覆盖主链路。种子数据包含 24 篇文章、10 个标签、6 个用户，以及 4 位讲师、10 门公益免费课程和 30 条报名记录。

课程相关的验收入口：首页「精品课程」板块（分类 tab + 「加载更多」）、课程详情 `http://localhost:3000/courses/1`，后台在右上角头像下拉里进「课程管理」`http://localhost:3000/admin/courses` 与「讲师管理」`http://localhost:3000/admin/teachers`（需管理员账号）。

## 4. 日常启动（第二次及以后）

数据库容器和数据已经就绪，不需要再迁移/播种，两步即可：

```powershell
# 1. 启动三个容器（如果已运行会跳过）
docker compose up -d postgres redis meilisearch

# 2. 启动前后端
pnpm dev
```

## 5. 常用命令速查

| 命令                                        | 作用                                   |
| ------------------------------------------- | -------------------------------------- |
| `pnpm dev`                                  | 同时启动 web(3000) + api(3001)         |
| `pnpm dev:web`                              | 只启动前端                             |
| `pnpm dev:api`                              | 只启动后端                             |
| `pnpm build`                                | 构建 shared + api + web（生产产物）    |
| `pnpm test`                                 | 运行后端 Jest + 前端 Vitest 全部测试   |
| `pnpm db:migrate`                           | 执行数据库迁移                         |
| `pnpm db:seed`                              | 写入演示数据                           |
| `pnpm --filter @devshare/api prisma:studio` | 用图形界面浏览数据库                   |
| `docker compose ps`                         | 查看容器运行状态                       |
| `docker compose down`                       | 停止并删除容器（数据卷保留，数据不丢） |

## 6. 测试怎么跑

| 测试              | 命令                                   | 是否需要数据库               |
| ----------------- | -------------------------------------- | ---------------------------- |
| 后端单元测试      | `pnpm --filter @devshare/api test`     | 不需要                       |
| 后端集成测试(e2e) | `pnpm --filter @devshare/api test:e2e` | 需要 postgres 已启动且已迁移 |
| 前端组件测试      | `pnpm --filter @devshare/web test`     | 不需要                       |

## 7. 常见问题排查

| 现象                                                 | 原因                                                                                                                                                                                    | 解决办法                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `docker: command not found`                          | Docker CLI 不在 PATH 或引擎未启动                                                                                                                                                       | 打开 Docker Desktop 等引擎变绿，重开终端                                                                         |
| `P1000: Authentication failed`                       | 两个 `.env` 密码不一致                                                                                                                                                                  | 核对根 `.env` 与 `apps/api/.env` 的密码并改为一致                                                                |
| `ECONNREFUSED` 连接失败                              | postgres/redis/meilisearch 容器没起来                                                                                                                                                   | `docker compose ps` 确认三个服务 running                                                                         |
| `Failed to resolve import "@devshare/shared"`        | 残留的 Nuxt 进程占用 `.nuxt` 锁文件                                                                                                                                                     | 结束 3000 端口进程，删除 `apps/web/.nuxt/nuxt.lock`（若有），重新 `pnpm dev`                                     |
| 端口被占用（3000/3001）                              | 上次的服务没关干净                                                                                                                                                                      | `Get-NetTCPConnection -LocalPort 3000,3001` 查看占用进程并结束                                                   |
| 首页 500 / 接口异常                                  | 数据库没迁移或种子缺失                                                                                                                                                                  | 重新执行 `prisma:migrate` 和 `prisma:seed`                                                                       |
| 图片/封面上传报 `Failed to fetch`（`<no response>`） | Windows 上 Nuxt 开发服务器默认只监听 IPv6 `::1`，浏览器请求 `127.0.0.1:3000` 连不上                                                                                                     | 在 `apps/web/nuxt.config.ts` 设置 `devServer.host: "::"`（并保留 `nitro.devProxy["/uploads"]`），重启 `pnpm dev` |
| 控制台出现 Suspense 实验特性提示（非报错）           | Vue 创建 <Suspense> 边界时的 console.info 提示，边界来自 Nuxt 自身                                                                                                                      | 无需处理；项目已在 `apps/web/plugins/suspense-notice.client.ts` 里做开发期过滤（`utils/dev-console.ts`）         |
| 页面报 `Failed to resolve import "#app-manifest"`    | 长时间运行的 dev server 内存里的别名指向已过期的 `.nuxt`，磁盘上的 `.nuxt` 被 `nuxt prepare` / `typecheck` / `pnpm install`（postinstall 会跑 `nuxt prepare`）或改 `nuxt.config` 重建过 | 重启 `pnpm dev` 即可，不用删 `.nuxt`                                                                             |

## 8. 端口占用检查（Windows）

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,3001,5432,6379,7700 }
```

若某个端口被占用，记录 `OwningProcess` 的 PID，确认是残留进程后结束它：

```powershell
Stop-Process -Id <PID> -Force
```

## 9. 生产环境差异（了解即可）

本指南仅用于本地开发。生产部署使用 `docker compose -f docker-compose.prod.yml` 在服务器上运行，API/Web 也都跑在容器里，由 Nginx 统一入口 + HTTPS + CDN，详见 [DEPLOY.md](DEPLOY.md)。
