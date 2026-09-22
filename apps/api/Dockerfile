FROM crpi-uo2gx7e52udrmw75.cn-guangzhou.personal.cr.aliyuncs.com/devshare/node:22-slim AS base
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.20.0
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @devshare/api... --filter @devshare/shared

FROM base AS build
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY . .
RUN pnpm --filter @devshare/shared build
RUN pnpm --filter @devshare/api exec prisma generate
RUN pnpm --filter @devshare/api build
# Compile the Prisma seed to JS so prisma db seed works without ts-node in the prod image
RUN pnpm --filter @devshare/api exec tsc prisma/seed.ts --outDir prisma --rootDir prisma --module commonjs --target es2020 --esModuleInterop --skipLibCheck --moduleResolution node --resolveJsonModule --sourceMap false
RUN pnpm --filter @devshare/api deploy --prod --legacy --ignore-scripts /app/prod
# pnpm deploy 不会把 prisma generate 生成的客户端(.prisma/client，含 query engine)带进产物，
# 导致运行时 @prisma/client 报 "did not initialize yet"。这里把构建阶段已生成的客户端拷进部署目录。
RUN cd /app/prod && for d in node_modules/.pnpm/@prisma+client@*; do \
      rm -rf "$d/node_modules/.prisma" && \
      cp -r /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma "$d/node_modules/"; \
    done
# 把 prisma 引擎(@prisma/engines)拷进部署目录，保证容器内能跑 prisma migrate deploy
RUN cd /app/prod && for d in node_modules/.pnpm/@prisma+engines@*; do \
      rm -rf "$d/node_modules/@prisma/engines" && \
      cp -r /app/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines "$d/node_modules/@prisma/"; \
    done

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/prod /app
# pnpm deploy 不会把私有 workspace 包 @devshare/shared 带入产物，这里显式拷贝
RUN rm -rf /app/node_modules/@devshare/shared
COPY --from=build /app/packages/shared/package.json /app/node_modules/@devshare/shared/package.json
COPY --from=build /app/packages/shared/dist /app/node_modules/@devshare/shared/dist
COPY --from=build /app/apps/api/prisma /app/prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
