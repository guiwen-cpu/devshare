# DevShare（技享）部署手册

> 目标架构：一台 ECS（Docker Compose）同时承载 **staging** 与 **prod** 两套环境，
> 每套环境各自独立的 web / api / postgres / redis / meilisearch / nginx 容器与数据卷，
> 前面挂阿里云 CDN；图片走 OSS + CDN。
> 镜像统一由 GitHub Actions 构建并推送到阿里云 ACR，服务器只负责拉取和运行。

## 0. 环境总览

- **staging**：`dev` 分支推送后自动部署，入口 `http://<服务器IP>:8080`，数据与 prod 完全隔离。
- **prod**：`main` 分支推送后，需在 GitHub 上人工审批，再自动部署；入口域名 80/443 + certbot。
- 两套环境在同一台 ECS 上以两个 Compose 项目运行：`devshare-staging` 与 `devshare-prod`。
- `NODE_ENV` 恒为 `production`（运行模式，不是环境开关）；环境差异全部由服务器上的
  `.env.staging` / `.env.prod` 注入。

## 1. 域名与备案（并行，先启动）

1. 在阿里云"域名注册"购买域名（如 `devshare.dev`）。
2. 在"ICP 备案"控制台提交备案申请（个人备案约 1-2 周）。
3. **备案完成前**：域名不得解析到大陆服务器公网访问，可用 `http://服务器IP:8080` 临时验收。
4. 备案通过后：域名解析记录（A 记录指向 ECS IP，或 CNAME 到 CDN 加速域名）。

## 2. 服务器（ECS）

- 规格：2C4G 起步，系统盘 40-60GB，带宽按量 5Mbps 起步。
- 系统：Ubuntu 22.04 / Alibaba Cloud Linux 3。
- 安全组放行：22（SSH）、80、443、8080（staging 用）。
- 安装 Docker（Compose v2 已内置）：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

## 3. GitHub / ACR 初始化（一次性）

### 3.1 阿里云 ACR

1. 开通容器镜像服务（个人版即可），创建命名空间（如 `devshare`），创建镜像仓库 `devshare-web` 与 `devshare-api`。
2. 在"访问凭证"页设置固定密码，供 `docker login` 使用。
3. 记录仓库地址，格式：`registry.cn-<region>.aliyuncs.com/<namespace>`（如 `registry.cn-hangzhou.aliyuncs.com/devshare`）。

### 3.2 GitHub 仓库配置

进入仓库 **Settings → Environments**，创建两个环境：

**`staging`** 环境（无需审批）：

- Secrets：
  - `ACR_REGISTRY`：`registry.cn-<region>.aliyuncs.com/<namespace>`
  - `ACR_USERNAME` / `ACR_PASSWORD`：ACR 访问凭证
  - `SERVER_HOST` / `SERVER_USER` / `SERVER_SSH_KEY`：ECS 登录信息与私钥

**`prod`** 环境（勾选 Required reviewers，至少一名审批人）：

- Secrets：同上（`SERVER_*` 可各自不同）

另外在仓库 **Settings → Secrets and variables → Actions → Secrets** 配置**仓库级 Secrets**：

- `ACR_REGISTRY`：`registry.cn-<region>.aliyuncs.com/<namespace>`
- `ACR_USERNAME` / `ACR_PASSWORD`：ACR 访问凭证

> 注意：`build-push` 任务没有绑定 environment，`${{ secrets.XXX }}` 只能读到仓库级 Secrets。
> 如果只把 `ACR_*` 配在 `staging`/`prod` 环境里，`docker/login-action` 会因拿不到用户名/密码而报
> `Username and password required`。因此 `ACR_*` **必须**是仓库级 Secrets。

另外在仓库 **Settings → Secrets and variables → Actions → Variables** 配置两个**仓库级变量**：

- `NUXT_PUBLIC_SITE_URL_STAGING`：`http://<服务器IP>:8080`
- `NUXT_PUBLIC_SITE_URL_PROD`：`https://www.example.com`

> 注意：`build-push` 任务没有绑定 environment，`${{ vars.XXX }}` 只能读到仓库级变量，
> 所以不能只配在环境的 Variables 里。

> `NUXT_PUBLIC_SITE_URL_*` 用于构建期写入 Nuxt public config（客户端包会内联该值），
> 必须与服务器 `.env.staging` / `.env.prod` 中的 `NUXT_PUBLIC_SITE_URL` 保持一致。

## 4. 服务器首次初始化（一次性）

```bash
git clone <your-repo> /srv/devshare && cd /srv/devshare
cp .env.staging.example .env.staging
cp .env.prod.example .env.prod
vi .env.staging   # 填 staging 端口、域名、密钥
vi .env.prod      # 填 prod 域名、强随机密钥
docker login registry.cn-<region>.aliyuncs.com   # 登录 ACR，凭据会持久化
```

首次部署建议手动触发一次（与 CI 命令一致）：

```bash
git pull
bash deploy/deploy.sh staging <sha>     # 全新 staging：自动建库 + 迁移
bash deploy/deploy.sh prod <sha>        # 全新 prod：自动建库 + 迁移
```

全新 staging 环境如需初始数据，手动执行 seed（prod 永不自动 seed）：

```bash
docker compose -p devshare-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml \
  exec -T api npx prisma db seed
```

### 批量导入课程与讲师（一次性）

生产的课程 / 讲师数据平时由管理员在 `/admin/courses`、`/admin/teachers` 录入；
若要在生产快速灌入一批数据，用批量导入脚本。脚本走管理员 HTTP API（不直连数据库），
**默认 dry-run**，且幂等（讲师按姓名、课程按标题去重，重复执行不会产生重复数据）。

数据文件是一份自备的 JSON，仓库里附了可直接改的样例 `apps/api/prisma/courses.example.json`。

前置：脚本要用**管理员**账号登录。prod 从不执行 seed，而注册接口只会建普通用户
（`User.role` 默认 `user`），所以首次使用前先在服务器上把一个账号提权：

```bash
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres psql -U devshare -d devshare \
  -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

方式一：在本地或任意能访问目标环境的机器上跑（仓库内已装好 ts-node，无需登录服务器）：

```bash
cp apps/api/prisma/courses.example.json courses.json   # 按样例改内容
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD='<管理员密码>'
export API_BASE_URL=https://www.example.com/api/v1

pnpm --filter @devshare/api prisma:import -- --file courses.json           # 先看将要创建什么
pnpm --filter @devshare/api prisma:import -- --file courses.json --apply   # 真正写入
```

方式二：在服务器容器内跑（镜像构建时已把脚本编译成 JS，容器内不需要 ts-node）。
容器里没有你的文件，用 `--stdin` 把 JSON 从宿主机管道传进去，省掉拷文件：

```bash
cd /srv/devshare
cat courses.json | docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T api node prisma/import-courses.js --stdin --apply
```

如果更习惯落地成文件，也可以先拷贝再执行：

```bash
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  cp courses.json api:/tmp/courses.json
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T api node prisma/import-courses.js --file /tmp/courses.json --apply
```

两种方式默认都是 dry-run，`--apply` 才真正写入；JSON 字段与 `--stdin` / `--update`
等参数说明见 `apps/api/prisma/import-courses.ts` 文件头注释。三点注意：

- 全局限流是 120 次 / 60 秒，脚本已按 700ms 间隔降速，调小间隔会撞 429；
- 课程封面 / 视频请填 OSS / CDN 绝对地址（后台上传会自动写入 OSS 地址），历史本地 `/uploads/*` 链接不再兼容；
- 脚本只做新建 / 更新，不会删除任何数据；误导入在后台逐条删除即可。

## 5. 日常部署（CI/CD）

流水线位于 `.github/workflows/ci.yml`，行为如下：

- 任意 PR / push：执行 lint 与单元测试。
- push `dev`：构建 web/api 镜像（tag `staging-<sha>` 与 `staging-latest`）→ 推送 ACR → SSH 到服务器执行
  `deploy/deploy.sh staging <sha>` → 健康检查 → 自动执行 `prisma migrate deploy`。
- push `main`：构建（tag `prod-<sha>` 与 `prod-latest`）→ 推送 ACR → 等待 GitHub `prod` 环境审批 →
  SSH 执行 `deploy/deploy.sh prod <sha>` → 健康检查 → 自动执行迁移。

手动部署 / 回滚（在服务器 `/srv/devshare` 下执行）：

```bash
bash deploy/deploy.sh staging <旧sha>              # 回滚 staging 到指定镜像
bash deploy/deploy.sh prod <旧sha>                 # 回滚 prod 到指定镜像
bash deploy/deploy.sh prod <sha> --no-migrate      # 只换镜像不跑迁移
```

回滚机制：部署脚本会把最近一次成功部署的 sha 记录在 `.last-staging` / `.last-prod`；
健康检查或迁移失败时自动回滚到上一个 sha。prod 迁移前建议先备份数据库：

```bash
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U devshare devshare | gzip > pg-backup-$(date +%F).sql.gz
```

## 6. HTTPS

```bash
# 域名解析到 ECS 后，为站点申请证书
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm certbot certonly --webroot -w /var/www/certbot \
  -d www.example.com -d example.com
```

签发成功后，打开 `deploy/nginx.conf` 中的 443 server 块（填写域名与证书路径）并重启 nginx：

```bash
docker compose -p devshare-prod --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```

## 7. OSS + CDN（图片与视频）

1. 开通 OSS，创建 Bucket（如 `devshare-assets`，权限设为**公共读**——图片展示与视频播放都直接读它）。
2. 创建 RAM 子账号，授权 Bucket 的 `PutObject` 和 `sts:AssumeRole`（图片与视频都由浏览器直传，服务端只签发临时凭证），拿到 AccessKey。
3. 在 `.env.staging` / `.env.prod` 填入 `OSS_*`，`OSS_PUBLIC_URL` 指向 CDN 加速域名（本站为 `https://cdn.devshare.bond`）——新上传的图片 / 视频地址按它拼出来。
4. 阿里云 CDN：添加加速域名 `cdn.devshare.bond` → 源站类型"OSS 域名"。这个域名要和后端 `OSS_PUBLIC_URL`、前端 `apps/web/utils/image.ts` 里的 `CDN_HOST` 保持一致；前端还会把老数据里的 OSS 直连地址映射过来，历史图片不用刷库。
5. CDN 缓存规则：`/uploads/*` 缓存 30 天（对象名是 UUID、内容不可变，与对象上的 `Cache-Control: public,max-age=31536000,immutable` 一致）。
6. 图片与视频都由**浏览器直传 OSS**，服务端不再落盘：没配 `OSS_*` 或 `OSS_STS_ROLE_ARN` 时，所有上传入口（头像 / 封面 / Banner 图 / 课程视频）一律置灰，没有本地磁盘兜底。展示图片时前端会追 `x-oss-process=image/format,webp`，由 OSS 图片处理（IMG）按需输出 WebP；bucket 没开通 IMG 时在 `.env.prod` / `.env.staging` 设 `NUXT_PUBLIC_OSS_IMAGE_WEBP=off` 一键回退原图（compose 会把它注入 web 容器）；单图上限用 `MAX_IMAGE_SIZE_MB` 调整（默认 20）。
   写进 bucket 的对象都带 `Cache-Control: public,max-age=31536000,immutable`（对象名是 UUID、内容永不改变）：图片和视频都通过 SDK 的请求头携带（视频在 InitiateMultipartUpload 时写进对象元数据）；值取自 `@devshare/shared` 的 `UPLOAD_CACHE_CONTROL`，改缓存策略只改这一处。
7. **课程视频**与图片共用同一套直传链路，视频还需要额外三步：
   - 建一个 **RAM 角色**（信任实体选「当前账号」，`MaxSessionDuration` 默认 3600 秒，想签更久的凭证要在这里调大），给它 `oss:PutObject` 权限，把角色 ARN 填进 `OSS_STS_ROLE_ARN`；再给第 2 步那个 RAM 子账号加一条 `sts:AssumeRole` 权限（只允许它扮演这一个角色最稳妥）。视频走浏览器 **ali-oss SDK + STS 临时凭证**分片直传，长期 AccessKey 只留在服务端，下发的凭证用会话策略钉死到单个对象名；凭证有效期用 `OSS_STS_DURATION_SECONDS` 调整（默认 3600 秒，下限 900，上限受角色的 MaxSessionDuration 约束）。
   - bucket 配置 **CORS** 规则，允许站点域名（`https://www.example.com`、CDN 域名 `https://cdn.devshare.bond` 与本地 `http://localhost:3000`——CDN 域名少不得，海报用 canvas 读图，缺 CORS 画布会被污染、导出直接抛错）：`Allowed Method` 勾 `PUT, GET, POST, DELETE, HEAD`，`Allowed Header` 填 `*`，**务必在「暴露 Headers」里加上 `ETag`**（分片上传要读响应里的 ETag，缺了 SDK 会直接报错），缓存时间建议 600。图片和视频都从浏览器直传，GET/HEAD 不够——只放行 GET/HEAD 会让上传在预检阶段报 403 `AccessForbidden`；
   - 对象**保持公共读**，`<video>` 才能直接流式播放（`OSS_PUBLIC_URL` 指向 CDN 加速域名时同理）。
     图片与视频都走浏览器分片直传，文件体不经过 Node 与 nginx，因此 2GB+ 也不受 nginx `client_max_body_size 10m` 与 multer 内存缓冲限制；上限分别用 `MAX_IMAGE_SIZE_MB`（默认 20）与 `MAX_VIDEO_SIZE_MB`（默认 4096）调整；临时凭证由 SDK 在过期前自动续签（续签复用同一个对象名），不需要靠调大有效期来支持超长上传。

     RAM 子账号只授 `PutObject`（视频另需 `sts:AssumeRole`）就够了——**应用从不删除对象**（换封面、换视频都只写新 key），代价是旧对象只能靠在控制台手动删，或配一条前缀限定的生命周期规则自动清理（不要作用于在用的 `uploads/**`，否则会把线上对象一并清掉）。

## 8. 主站 CDN（HTML 与静态资源加速）

- 给 `www.example.com` 添加 CDN 加速域名，源站为 ECS IP（80/443）。
- 缓存规则：`/_nuxt/*` 缓存 30 天（不可变）；`/`、`/article/*` 缓存 60 秒（SWR 语义，回源 Nuxt 已有 SWR 缓存）；其余不缓存（动态请求）。
- 海外用户可开启 CDN 海外节点，实现全球加速。

## 9. 更新与维护f

```bash
cd /srv/devshare
# 日常更新由 CI 自动完成（push dev/main）；服务器上只需查看状态：
docker compose -p devshare-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.staging.yml ps
docker compose -p devshare-prod    --env-file .env.prod    -f docker-compose.yml -f docker-compose.prod.yml    ps
docker compose -p devshare-prod logs -f --tail=100 api web
```

## 10. 常见问题

- **镜像拉取慢**：确认 `ACR_REGISTRY` 的 region 与 ECS 同区（如都在杭州用 `registry.cn-hangzhou.aliyuncs.com`）。
- **端口冲突**：staging 已与 prod 错开（staging 8080/8443，DB 等 15432/16379/17700）；如仍冲突，
  检查是否有其他进程占用端口（`ss -ltnp`）。
- **ACR 登录过期 / 401**：重新 `docker login registry.cn-<region>.aliyuncs.com`。
- **服务器 `git fetch` 失败**：仓库需可匿名访问（公开仓库）或配置凭据；`.env.*` 已在 `.gitignore` 中不会丢失。
- **迁移失败**：迁移是事务性的，失败后脚本会自动回滚镜像；继续排查时先 `pg_dump` 备份。
- **首页缓存不刷新**：SWR 60 秒 + CDN 60 秒是预期行为；文章发布后最长 ~2 分钟全网可见。
- **本机 Node 版本**：nvm-windows 用户在管理员终端 `nvm use 22.14.0`；或直接使用 `D:\node22`
  （将 `D:\node22` 放到 PATH 最前）。

## 11. 静态错误页（404 / 5xx）

- 品牌化错误页源文件在 `deploy/errors/{zh,en}/{404,5xx}.html`，自包含（内联 CSS / SVG），无需外部资源。
- `nginx` 容器通过只读卷挂载该目录（见 `docker-compose.yml`），并用 `error_page` 在 404 / 502-504 时内部重定向到对应静态页。
- 修改 `deploy/errors/` 后无需重建镜像，重新 `docker compose up -d` 即可生效（nginx 加载最新文件）。
- 语言按 URL 前缀区分：默认中文（根路径 `/`），英文走 `/en`。
- `location /` 与 `location /_nuxt/` 已开启 `proxy_intercept_errors on`，因此 Nuxt 返回的 404 也会被静态错误页接管；3xx 重定向仍正常透传。
