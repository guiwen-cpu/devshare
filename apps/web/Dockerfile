# =====================================================================
# DevShare 前端镜像（Nuxt 4 SSR）
# ---------------------------------------------------------------------
# 什么是 Dockerfile：一份"镜像制作说明书"。docker build 会从上到下
# 逐行执行，每一步生成一层，最终产出一个可以到处运行的镜像。
#
# 什么是多阶段构建（multi-stage）：本文件里有 4 个阶段
#   base → deps → build → runtime
# 前面的阶段负责"准备原料"和"编译"，最后只有 runtime 阶段的产物
# 会被保留进最终镜像。这样最终镜像很小、很干净——只包含运行时
# 需要的文件，不包含源码和几 GB 的 node_modules。
# 这也是为什么会有 4 个 FROM：每个 FROM 开启一个新的构建阶段。
# =====================================================================

# ---------------------------- 阶段 1：base ----------------------------
# 选一个基础镜像：node:22-slim 是"官方 Node 22 + 超小体积的 Linux
# (Alpine)"组合。Alpine 很小（几 MB），所以生产镜像普遍用它。
# AS base 给这个阶段起了个名字，后面 FROM base 表示"接着这个镜像继续"。
FROM crpi-uo2gx7e52udrmw75.cn-guangzhou.personal.cr.aliyuncs.com/devshare/node:22-slim AS base

# apk 是 Alpine 的软件包管理器（相当于 Ubuntu 的 apt）。
# --no-cache 表示装完不保留缓存，尽量减小镜像体积。
# openssl：Prisma/Node 加密相关需要 OpenSSL 动态库；
# libc6-compat：Alpine 用的 C 库 (musl) 与常见 Linux (glibc) 不完全兼容，
#   装上兼容层，很多原生模块（如 esbuild）才能跑。
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 官方 node 镜像自带 npm，但项目用 pnpm 管理依赖，所以全局装一份 pnpm。
RUN npm install -g pnpm@11.20.0

# 指定工作目录：镜像里后续所有命令（RUN/COPY 的目标路径）默认都在
# /app 下执行。注意：/app 是"镜像内部"的路径，不是你电脑上的路径。
WORKDIR /app

# ---------------------------- 阶段 2：deps ----------------------------
# 目的：只安装依赖，不复制源代码。这样只要 package.json 没变，
# Docker 就能复用缓存，不用每次构建都重新下载几千个包。
FROM base AS deps

# 先把"依赖清单"拷进镜像：
#   pnpm-workspace.yaml  workspace 配置（哪些目录是子项目）
#   pnpm-lock.yaml       锁文件（锁定每个依赖的精确版本，保证可复现）
#   package.json         根 package.json
#   .npmrc               pnpm/npm 配置
# ./ 表示拷到当前工作目录 /app 下（文件路径必须与上面一致，否则装不上）
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./

# 只先拷贝各子项目的 package.json（依赖清单），不拷贝源码。
# 这是 monorepo + Docker 的经典优化：告诉 pnpm 有哪些子项目，
# 好让它解析 workspace 依赖关系。
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

# 安装依赖。关键参数：
#   --frozen-lockfile  严格按照锁文件安装，锁文件不一致就直接报错。
#                      好处：任何人/任何机器构建出来的依赖完全一致。
#   --filter @devshare/web...   只安装 web 及它依赖的 workspace 包，
#                      带 ... 表示"连同它依赖的 workspace 兄弟一起装"。
#   --filter @devshare/shared   显式把 shared 也带上。
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @devshare/web... --filter @devshare/shared

# ---------------------------- 阶段 3：build ----------------------------
# 目的：拿到完整源码，编译出生产产物（.output）。
FROM base AS build

# 把阶段 2 装好的 node_modules 原样搬过来（--from=deps 表示从 deps 阶段拷贝）。
# 这样就不用重新下载依赖了。
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/web/node_modules /app/apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules /app/packages/shared/node_modules

# 拷贝全部源码到镜像（. 表示 docker build 的"构建上下文"目录）。
# 注意：构建上下文是仓库根目录（docker-compose.yml 里 context: .），
# 所以这里的 COPY . . 会把整个仓库（含 apps/api 等）都拷进来，
# 构建上下文中不想要的文件用 .dockerignore 排除（比如 node_modules）。
COPY . .

# 设置构建时的环境变量：生产模式（影响打包行为，如压缩、警告关闭）。
ENV NODE_ENV=production

# 先编译共享类型包（web 依赖它的 dist 产物），再编译 Nuxt 前端。
# 编译结果会输出到 apps/web/.output。
# 当前环境的站点 URL 通过构建参数注入（Nuxt public config 会内联到客户端包）。
ARG NUXT_PUBLIC_SITE_URL
ENV NUXT_PUBLIC_SITE_URL=$NUXT_PUBLIC_SITE_URL
RUN pnpm --filter @devshare/shared build
RUN pnpm --filter @devshare/web build

# ---------------------------- 阶段 4：runtime --------------------------
# 目的：最终镜像。只保留运行所需的最小文件，不含源码和 node_modules。
FROM base AS runtime

# 运行时的环境变量：NODE_ENV=production 让 Node/Nuxt 按生产模式运行；
# HOST=0.0.0.0 让服务监听所有网卡——Docker 容器必须这么设置，
# 否则外部（Nginx 或其他容器）无法访问到它。
ENV NODE_ENV=production
ENV HOST=0.0.0.0

# 容器内工作目录
# WORKDIR /app

# 把阶段 3 编译出的 .output（Nuxt 的完整运行包：服务端代码 + 静态资源）
# 拷进最终镜像。这是最终镜像里唯一的"业务文件"。
COPY --from=build /app/apps/web/.output /app/.output

# 声明容器对外端口 3000。这只是"说明书"，真正对外开放端口
# 还要在 docker-compose.yml / docker run 里用 -p 映射。
EXPOSE 3000

# 容器启动时执行的命令（JSON 数组格式，数组元素之间不能有引号之外的空格）
# 等效于在终端里执行：node .output/server/index.mjs
# 这就是 Nuxt 生产服务器（Nitro）的入口。
CMD ["node", ".output/server/index.mjs"]
