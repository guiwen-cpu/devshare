import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { MeiliSearch } from 'meilisearch'
import { DEFAULT_TAGS } from '@devshare/shared'

const prisma = new PrismaClient()

const DEMO_TITLES = [
  'Vue 3 组合式 API 实战：从零封装一个高性能列表组件',
  '深入理解 Next.js App Router 的数据缓存机制',
  'PostgreSQL 全文检索与中文分词方案对比',
  'NestJS + Prisma 项目最佳实践：模块化与依赖注入',
  '前端性能优化清单：从 Lighthouse 到真实用户监控',
  'TypeScript 类型体操入门：条件类型与 infer',
  '用 Docker Compose 一键部署全栈应用',
  'Redis 缓存策略：穿透、击穿、雪崩与多级缓存',
  'Tailwind CSS v4 新特性详解：CSS-first 配置',
  '虚拟滚动原理与实现：10000 条数据也不卡',
  '浅谈 CDN 边缘加速与缓存命中率优化',
  'GraphQL 与 REST 的取舍：我们为什么选 REST',
  '浏览器渲染原理：关键渲染路径优化',
  'Node.js 事件循环与异步 I/O 深入剖析',
  '数据库索引设计：B+ 树与覆盖索引',
  '微服务还是单体？小团队的架构演进之路',
  'Web 安全实践：XSS、CSRF 与 CORS',
  '用 Vitest 给 Vue 组件写高质量单元测试',
  'Monorepo 工程化：pnpm workspace 实践',
  'ESLint 9 扁平化配置完全指南',
  'SSR 与 CSR 的边界：什么时候该用服务端渲染',
  'Object Storage 选型：OSS、S3 与 R2 对比',
  'JWT 与 Session 之争：现代认证方案解析',
  '从零实现一个 Mini Meilisearch 索引',
]

const DEMO_BODY = (title: string): string => `
# ${title}

> 这是一篇由种子脚本生成的示例文章，用于演示 DevShare（技享）的排版与数据流。

## 背景

在大型 Web 应用中，**性能** 与 **可维护性** 常常是团队面临的核心挑战。本文将从工程实践出发，分享一套可落地的方案。

## 核心思路

1. 先确定性能指标与验收标准；
2. 用数据驱动优化，而不是凭感觉；
3. 关注关键路径，缓存一切可以缓存的内容。

\`\`\`ts
const greeting = (name: string) => \`Hello, \${name}!\`
console.log(greeting('DevShare'))
\`\`\`

## 小结

优化没有银弹，但**持续度量 + 渐进改进** 永远是正确的方向。欢迎在评论区交流你的实践。
`

interface DemoCourse {
  title: string
  summary: string
  audience: string[]
  difficulty: 'beginner' | 'elementary' | 'intermediate' | 'advanced'
  badge?: string
  tagSlugs: string[]
}

const DEMO_TEACHERS = [
  {
    name: '林深',
    bio: '前大厂后端架构师，十年 JVM 与分布式系统经验，擅长把复杂机制画成漫画讲清楚。',
  },
  {
    name: '苏航',
    bio: 'AI 应用工程师，专注 LLM 工程化落地，带队把代码助手接进真实研发流水线。',
  },
  {
    name: '陈默',
    bio: '全栈独立开发者，做过 20+ 微信小游戏与效率工具，信奉一个人也能跑通整条生产链。',
  },
  {
    name: '周晓',
    bio: '前端技术专家，Vue / React 双栈，长期关注渲染性能与前端工程化体系搭建。',
  },
]

const DEMO_COURSES: DemoCourse[] = [
  {
    title: 'AI 时代再学 Java（漫画版）',
    summary: 'AI 时代再学 Java（小白入行 / 前端转全栈必修），把 JVM、并发与集合底层画成漫画。',
    audience: ['想转行后端的初学者', '只会写业务代码的前端', '面试前需要补底层原理的同学'],
    difficulty: 'beginner',
    badge: '新课',
    tagSlugs: ['backend', 'ai'],
  },
  {
    title: '超级个体必修课，Codex 多场景自动化生产实战',
    summary: '把 AI 编码助手接进真实研发流程：需求拆解、批量重构、测试补齐与文档生成。',
    audience: ['独立开发者', '想用 AI 提效的小团队', '对自动化流水线感兴趣的同学'],
    difficulty: 'beginner',
    badge: '新课',
    tagSlugs: ['ai', 'tools'],
  },
  {
    title: 'Suno AI 人人都是音乐创作者全流程实战课',
    summary: '从一句提示词到完整单曲：作词、编曲、混音与发行，全流程用 AI 跑通。',
    audience: ['零基础音乐爱好者', '短视频运营', '想把 AI 用进创作的开发者'],
    difficulty: 'beginner',
    badge: '新课',
    tagSlugs: ['ai', 'tools'],
  },
  {
    title: 'Agent Loop + Graph Engineer 工程化实战',
    summary: '从零搭建可观测、可回滚的 Agent 编排循环，把智能体接进生产系统的工程方法论。',
    audience: ['有后端经验的工程师', '正在做 AI 应用的团队', '想系统理解 Agent 架构的同学'],
    difficulty: 'elementary',
    badge: '新课',
    tagSlugs: ['ai', 'backend'],
  },
  {
    title: 'Vibe Gaming 一人工作室微信小游戏开发实战',
    summary: '一个人做完一款能上线的微信小游戏：玩法设计、渲染性能、分包与广告变现。',
    audience: ['想独立做游戏的全栈工程师', '有前端基础的开发者', '游戏方向学生'],
    difficulty: 'beginner',
    badge: '新课',
    tagSlugs: ['frontend', 'tools'],
  },
  {
    title: '零基础 AI 漫剧智能量产创作营',
    summary: '从脚本到成片批量产出 AI 漫剧，覆盖分镜生成、角色一致性与批量渲染流水线。',
    audience: ['内容创作者', '想批量产出视频的运营', '对 AI 生成流水线感兴趣的开发者'],
    difficulty: 'elementary',
    badge: '公益',
    tagSlugs: ['ai'],
  },
  {
    title: '前端性能优化实战：从 Lighthouse 到真实用户监控',
    summary: '把指标落到真实业务上：关键渲染路径、包体拆分、缓存策略与 RUM 监控闭环。',
    audience: ['有 1 年以上经验的前端', '负责 C 端性能的同学', '准备进阶面试的工程师'],
    difficulty: 'intermediate',
    tagSlugs: ['performance', 'frontend'],
  },
  {
    title: 'PostgreSQL 索引设计与慢查询治理',
    summary: '从 B+ 树原理到执行计划解读，用真实慢 SQL 案例讲清索引设计与查询改写。',
    audience: ['后端工程师', 'DBA 与运维', '被慢查询困扰的开发者'],
    difficulty: 'intermediate',
    tagSlugs: ['database', 'backend'],
  },
  {
    title: '云原生入门：Docker 与 Kubernetes 实战',
    summary: '入门公开课：容器化你的应用、写出可维护的镜像，并部署到 Kubernetes 集群。',
    audience: ['第一次接触容器化的开发者', '需要自己部署服务的前端', '运维新人'],
    difficulty: 'beginner',
    tagSlugs: ['cloud-native'],
  },
  {
    title: 'TypeScript 类型体操进阶：从能用到好用',
    summary: '条件类型、infer、映射类型与类型推导的组合拳，写出既安全又好维护的公共类型。',
    audience: ['写 TS 但很少碰泛型的前端', '负责公共库与组件库的同学', '想提升类型设计的工程师'],
    difficulty: 'advanced',
    tagSlugs: ['frontend', 'react'],
  },
]

/// 课程演示数据：库中已有课程就整体跳过，可重复执行 `pnpm db:seed`
async function seedCourses(tags: { id: number; slug: string }[], users: { id: number }[]) {
  if ((await prisma.course.count()) > 0) {
    console.log('Courses already present, skipping.')
    return
  }

  const teachers = await Promise.all(
    DEMO_TEACHERS.map((teacher) =>
      prisma.teacher.create({ data: { name: teacher.name, bio: teacher.bio } }),
    ),
  )
  const tagBySlug = new Map(tags.map((tag) => [tag.slug, tag.id]))
  const now = Date.now()
  let enrollmentCount = 0

  for (let i = 0; i < DEMO_COURSES.length; i++) {
    const demo = DEMO_COURSES[i]
    const course = await prisma.course.create({
      data: {
        title: demo.title,
        summary: demo.summary,
        audience: demo.audience,
        difficulty: demo.difficulty,
        badge: demo.badge ?? null,
        status: 'published',
        sortOrder: DEMO_COURSES.length - i,
        teacherId: teachers[i % teachers.length].id,
        publishedAt: new Date(now - (DEMO_COURSES.length - i) * 12 * 3600_000),
        tags: {
          create: demo.tagSlugs
            .map((slug) => tagBySlug.get(slug))
            .filter((id): id is number => typeof id === 'number')
            .map((tagId) => ({ tagId })),
        },
      },
    })

    // 每门课让“每隔一个”的用户报名，人数固定可复现，不依赖随机数
    const learners = users.filter((_, index) => (index + i) % 2 === 0)
    for (const learner of learners) {
      await prisma.enrollment.create({
        data: {
          courseId: course.id,
          userId: learner.id,
          status: 'enrolled',
        },
      })
      enrollmentCount += 1
    }
  }

  console.log(
    `Seeded ${DEMO_COURSES.length} courses, ${teachers.length} teachers, ${enrollmentCount} enrollments.`,
  )
}

// 种子数据是直接写库的，不会经过 API，也就不会触发 SearchService 的增量索引；
// 所以播种结束后主动把数据同步进 Meilisearch 一次，避免线上执行 `prisma db seed`
// 之后搜索一直查不到这批数据（reindexAll 只在 api 容器启动时跑一次）。
// 文档结构与 SearchService.reindexAll 保持一致：以 id 为主键，重复推送是覆盖，可重复执行。
async function syncSearchIndex(): Promise<void> {
  const host = process.env.MEILI_HOST
  if (!host) {
    console.log('MEILI_HOST not set, skip search index sync.')
    return
  }
  try {
    const client = new MeiliSearch({ host, apiKey: process.env.MEILI_MASTER_KEY ?? '' })
    const articles = await prisma.article.findMany({
      where: { status: 'published' },
      select: {
        id: true,
        title: true,
        summary: true,
        publishedAt: true,
        author: { select: { username: true } },
        tags: { include: { tag: { select: { slug: true } } } },
      },
    })
    const users = await prisma.user.findMany({
      select: { id: true, username: true, bio: true },
    })
    if (articles.length > 0) {
      await client.index('articles').addDocuments(
        articles.map((a) => ({
          id: a.id,
          title: a.title,
          summary: a.summary ?? '',
          tagSlugs: a.tags.map((t) => t.tag.slug),
          authorUsername: a.author.username,
          status: 'published',
          publishedAt: a.publishedAt?.getTime() ?? Date.now(),
        })),
      )
    }
    if (users.length > 0) {
      await client
        .index('users')
        .addDocuments(users.map((u) => ({ id: u.id, username: u.username, bio: u.bio ?? '' })))
    }
    console.log(`Search index synced: ${articles.length} articles, ${users.length} users.`)
  } catch (e) {
    // 索引同步失败不影响播种结果（数据已写库），这里只告警；
    // 最坏情况下 api 容器重启时的 reindexAll 还会再全量补一次。
    console.warn(`Search index sync failed: ${(e as Error).message}`)
  }
}

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'admin@devshare.dev' },
    update: {},
    create: {
      email: 'admin@devshare.dev',
      username: 'DevShareAdmin',
      passwordHash,
      role: 'admin',
      bio: 'DevShare（技享）官方账号',
    },
  })

  const authors = await Promise.all(
    ['LinDaiDai', 'CodeMaster', 'ByteDancer', 'AsyncAwait', 'TypeScriptFan'].map((name, i) =>
      prisma.user.upsert({
        where: { email: `${name.toLowerCase()}@devshare.dev` },
        update: {},
        create: {
          email: `${name.toLowerCase()}@devshare.dev`,
          username: name,
          passwordHash,
          bio: `热爱技术写作的开发者 #${i + 1}`,
        },
      }),
    ),
  )

  const allUsers = [admin, ...authors]
  const tags = await Promise.all(
    DEFAULT_TAGS.map((t) =>
      prisma.tag.upsert({
        where: { slug: t.slug },
        update: { name: t.name },
        create: { name: t.name, slug: t.slug },
      }),
    ),
  )

  await seedCourses(tags, allUsers)

  const existing = await prisma.article.count()
  if (existing > 0) {
    console.log('Seeds already present, skipping articles.')
    return
  }

  const now = Date.now()
  for (let i = 0; i < DEMO_TITLES.length; i++) {
    const title = DEMO_TITLES[i]
    const author = allUsers[i % allUsers.length]
    const tagSlice = [tags[i % tags.length], tags[(i + 3) % tags.length]]
    const publishedAt = new Date(now - (DEMO_TITLES.length - i) * 6 * 3600_000)
    const viewCount = 80 + ((i * 137) % 800)
    const likeCount = 5 + ((i * 29) % 90)
    const collectCount = 2 + ((i * 17) % 50)
    const commentCount = 1 + ((i * 7) % 30)

    const article = await prisma.article.create({
      data: {
        authorId: author.id,
        title,
        summary: `${title}——一篇关于工程实践与性能优化的深度文章。`,
        contentMd: DEMO_BODY(title),
        contentHtml: `<h1>${title}</h1><p>这是一篇由种子脚本生成的示例文章。</p>`,
        status: 'published',
        publishedAt,
        viewCount,
        likeCount,
        collectCount,
        commentCount,
        tags: {
          create: tagSlice.map((tag) => ({ tagId: tag.id })),
        },
      },
    })

    await prisma.comment.create({
      data: {
        articleId: article.id,
        authorId: allUsers[(i + 2) % allUsers.length].id,
        content: `写得很棒！关于「${title}」的实践有更多细节可以分享吗？`,
      },
    })
  }

  console.log(
    `Seeded ${DEMO_TITLES.length} articles, ${tags.length} tags, ${allUsers.length} users.`,
  )
}

main()
  // 无论这次有没有新建文章（库里已有数据时 main 会提前 return），都同步一次搜索索引。
  .then(() => syncSearchIndex())
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
