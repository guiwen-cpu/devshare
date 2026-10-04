# DevShare 后端学习指南（前端视角）

> 写给会 Vue / TypeScript、但没写过服务端的前端开发者。基于本项目真实用到的技术：NestJS 11 + Prisma + PostgreSQL + Redis + Meilisearch。
> 这是 [NUXT_GUIDE.md](NUXT_GUIDE.md) 的姊妹篇：那篇讲前端，这篇讲后端。建议先读根目录 `README.md` 了解整体架构，再按本文顺序学习。

---

## 第 0 章：先建立心智模型——后端是什么

前端同学第一次看后端代码，最常见的困惑是："这一堆文件夹、装饰器、数据库，到底在干嘛？"

先用三句话建立模型：

1. **后端是一个"一直在运行"的程序**。前端代码跑在用户的浏览器里，用户关掉页面就停了；后端跑在服务器上，7×24 小时监听一个端口，等请求进来。
2. **它只做三件事**：接收 HTTP 请求 → 读/写数据（数据库等）→ 返回 JSON。你在这项目里看到的所有模块，都是这三件事的展开。
3. **它是数据的唯一权威**。前端不能直接碰数据库，所有数据都必须通过后端开放的接口拿。后端说给什么，前端才能拿到什么。

### 前端 → 后端的思维对照表

| 前端世界的概念                  | 后端世界的对应物                     | 一句话说明                        |
| ------------------------------- | ------------------------------------ | --------------------------------- |
| Vue 组件                        | **Controller**                       | 负责"接"和"回"，不写业务逻辑      |
| composable / store 里的业务函数 | **Service**                          | 真正干活、算逻辑的地方            |
| props 类型 + 表单校验           | **DTO + class-validator**            | 请求入口的运行时校验              |
| Pinia store（内存状态）         | **PostgreSQL 数据库**                | 真正持久保存数据的地方            |
| `localStorage` / 内存缓存       | **Redis**                            | 快、但有容量和过期时间            |
| `import` 一个函数来用它         | **依赖注入（DI）**                   | 不自己 new，容器把实例"送"进来    |
| `route.params.id`               | `@Param('id')`                       | 从 URL 里取参数                   |
| `ref` / `computed` 自动更新     | （无对应）                           | 后端是"请求-响应"模型，没有响应式 |
| 页面加载时发请求                | 每次 HTTP 请求都是一次全新的函数调用 | 不要在后端"存页面状态"            |

### 一次请求的完整旅程

以"打开文章详情页 `http://localhost:3000/article/1`"为例：

```
浏览器
  │  ① 请求页面
  ▼
Nuxt（SSR）：服务端渲染时，直接向 API 发请求拿数据，把 HTML 拼好返回
  │  ② 服务端请求 http://127.0.0.1:3001/api/v1/articles/1
  ▼
NestJS API
  │  ③ 校验参数 → 检查登录态 → 进 Controller → 调 Service
  ▼
Prisma（ORM）
  │  ④ 生成 SQL：SELECT ... FROM articles WHERE id = 1
  ▼
PostgreSQL（数据）＋ Redis（浏览数 +1）
  │  ⑤ 查询结果回到 Service，组装成 JSON
  ▼
返回 { "data": { ...文章对象 } }
  │  ⑥ Nuxt 用它渲染 HTML；浏览器里的后续交互则走浏览器 → nginx → API
  ▼
页面显示
```

记住这张图。后面每一章，都只是把其中某一段拆开来讲。

---

## 第 1 章：后端全景图——这个项目由哪些部件组成

打开 [apps/api/](../apps/api/)，你会看到这些：

```
apps/api/
├── prisma/
│   ├── schema.prisma      # 数据库的"目录"：有哪些表、表之间什么关系
│   ├── migrations/        # 每次改表结构的 SQL 记录（版本化）
│   ├── seed.ts            # 种子脚本：初始化演示数据
│   └── import-courses.ts  # 批量导入课程
├── src/
│   ├── main.ts            # 程序入口：全局配置 + 启动
│   ├── app.module.ts      # 根模块：把所有业务模块组装起来
│   ├── <业务模块>/        # articles、auth、users、courses、uploads...
│   │   ├── *.controller.ts  # 接请求
│   │   ├── *.service.ts     # 业务逻辑
│   │   ├── *.module.ts      # 模块声明
│   │   └── dto/             # 请求参数的类型与校验规则
│   ├── prisma/            # PrismaService：数据库连接
│   ├── redis/             # RedisService：缓存连接
│   └── common/            # 通用过滤器 / 拦截器 / 装饰器 / DTO
└── test/                  # 端到端测试
```

每个业务模块（articles、courses…）都是同一套结构：**Controller 收请求，Service 干活，DTO 管校验，Module 做登记**。看懂一个，其他都差不多。

### 每个部件负责什么

| 部件                 | 是什么                                          | 没有它会怎样                          |
| -------------------- | ----------------------------------------------- | ------------------------------------- |
| **NestJS**           | 后端的"框架"，提供模块化、依赖注入、路由        | 得手写 HTTP 服务器和一堆重复代码      |
| **PostgreSQL**       | 关系型数据库，数据最终存这里                    | 数据一重启就没了                      |
| **Prisma**           | ORM：用 TypeScript 代码操作数据库，自动生成 SQL | 得手写 SQL 和类型                     |
| **Redis**            | 内存数据库：浏览计数、刷新令牌、热榜缓存        | 功能还能跑，但数据库压力大、性能差    |
| **Meilisearch**      | 全文检索引擎：文章/用户搜索                     | 搜索退回 SQL 模糊匹配，中文分词效果差 |
| **JWT + Passport**   | 登录凭证的签发与校验                            | 无法识别"你是谁"                      |
| **阿里云 OSS + STS** | 对象存储：图片/视频存这里，浏览器直传           | 文件只能传到服务器磁盘，大文件传不动  |
| **Swagger**          | 自动生成 API 文档（`/api/docs`）                | 前端只能靠翻代码猜接口                |
| **Docker Compose**   | 把数据库、缓存、API 等打包成容器一起跑          | 每台机器手动装环境                    |

> **为什么有这么多东西？** 它们不是"为了复杂而复杂"，每个都解决一个具体问题：数据要持久（PostgreSQL）、要快（Redis）、要好搜（Meilisearch）、大文件要能传（OSS）、要能部署（Docker）。前端世界里其实也有类似的分工：localStorage、内存缓存、搜索库、CDN 图片……只是后端把它们拆成了独立的系统。

### shared 包：前后端的"合同"

[packages/shared/src/index.ts](../packages/shared/src/index.ts) 被前后端**同时 import**，里面放着：

- 共享类型：`ArticleListItem`、`CourseDetail`、`Paginated<T>`…——后端返回什么形状，前端类型就是什么；
- 错误码 `ErrorCodes`：前端用 `code` 去 i18n 里找文案（见 [useApi.ts](../apps/web/composables/useApi.ts)）；
- 业务常量：上传允许的 MIME、`DEFAULT_TAGS`、Banner 字段长度上限…

这是 monorepo 的一个大好处：**接口改了，两边类型检查会同时报错**，不会悄悄对不上。

---

## 第 2 章：NestJS 三件套——Module / Controller / Service

### 2.1 先认识"装饰器"

后端代码里到处都是 `@Controller('articles')` 这样的写法。它是 **TypeScript 装饰器**：一种"贴在类 / 方法 / 参数上的标签"，运行时框架会读取这些标签做事情。

> ⚠️ 别和 Vue 的 `@click` 搞混。Vue 的 `@` 是模板语法（绑定事件）；TS 装饰器是给类和方法贴元数据，是语言特性。

```ts
@Controller('articles')        // 贴上标签：这个类负责 /articles 路由
export class ArticlesController {
  @Get(':id')                  // 贴上标签：GET /articles/:id 由这个方法处理
  async detail(@Param('id') id: string) { ... }
}
```

### 2.2 Controller：只负责"接"和"回"

看 [articles.controller.ts](../apps/api/src/articles/articles.controller.ts) 的一段：

```ts
@ApiTags('articles') // Swagger 分组
@Controller('articles') // 路由前缀
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {} // 依赖注入

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard) // 守卫：可登录可不登录
  @ApiOperation({ summary: '文章详情（SSR 使用，浏览计数 +1）' })
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.articles.detail(id, viewer) // 转交给 Service
  }
}
```

Controller 的"套路"就这几个装饰器：

| 装饰器                                          | 作用                         | 前端类比               |
| ----------------------------------------------- | ---------------------------- | ---------------------- |
| `@Controller('articles')`                       | 类级别，路由前缀             | `pages/articles/` 目录 |
| `@Get()` / `@Post()` / `@Patch()` / `@Delete()` | 方法级别，HTTP 方法 + 路径   | fetch 的 method + URL  |
| `@Param('id')`                                  | 取 URL 路径里的参数          | `route.params.id`      |
| `@Query()`                                      | 取 `?sort=hot&limit=20`      | `route.query`          |
| `@Body()`                                       | 取请求体（JSON）             | `fetch(url, { body })` |
| `@CurrentUser()`                                | 取当前登录用户（项目自定义） | store 里的 `auth.user` |
| `@UseGuards(...)`                               | 挂守卫，先过检查再进方法     | 路由中间件             |

**Controller 里不写业务逻辑**——这是约定。它只做三件事：取参数、调用 Service、返回结果。

### 2.3 Service：真正干活的地方

看 [articles.service.ts](../apps/api/src/articles/articles.service.ts)：查数据库、判断权限、组装返回结构，全在 Service 里。它就是一个普通的类，贴一个 `@Injectable()`：

```ts
@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService, // 数据库
    private readonly redis: RedisService, // 缓存
    private readonly search: SearchService, // 搜索
  ) {}
  // ...各种 async 方法
}
```

### 2.4 依赖注入（DI）：不用自己 new

前端习惯 `import { foo } from './foo'` 然后直接调用。Nest 的写法是：**在构造函数里声明"我需要什么"，框架负责创建并传进来**。

```ts
constructor(private readonly articles: ArticlesService) {}
```

好处：

- **可替换、可测试**：写单测时可以塞一个假 Prisma 进去（测试章节会看到）；
- **生命周期统一管理**：框架知道谁先创建、谁依赖谁；
- **不用到处 `new`**，也就不会出现循环依赖的初始化顺序问题。

要能"被注入"，这个类必须在某个 Module 里登记（`providers`）；要能被别的模块注入，还要 `exports`。全局模块（下面 2.6）则一次登记处处可用。

### 2.5 Module：把一块业务打包

每个业务目录都有一个 `*.module.ts`，比如 [articles.module.ts](../apps/api/src/articles/articles.module.ts)：

```ts
@Module({
  controllers: [ArticlesController], // 登记本模块的控制器（路由）
  providers: [ArticlesService], // 登记可被注入的类
  exports: [ArticlesService], // 允许别的模块注入它（比如 rank 模块要用）
})
export class ArticlesModule {}
```

模块的意义是**划边界**：articles 模块管文章，courses 模块管课程。谁要跨模块用东西，必须显式 `exports` / `imports`，依赖关系一目了然。

### 2.6 根模块与全局模块

[app.module.ts](../apps/api/src/app.module.ts) 把所有业务模块串起来：

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),   // 环境变量，全局可用
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]), // 限流：60 秒 120 次
    PrismaModule, RedisModule, HealthModule, AuthModule, ...
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],  // 全局守卫：所有接口默认限流
})
export class AppModule {}
```

其中 [PrismaModule](../apps/api/src/prisma/prisma.module.ts) 和 [RedisModule](../apps/api/src/redis/redis.module.ts) 带了 `@Global()`，所以任何 Service 都能直接注入 `PrismaService` / `RedisService`，不用逐个模块 import。

---

## 第 3 章：一次请求的完整流程（NestJS 版"洋葱模型"）

请求进入 NestJS 后，会依次穿过这几层，任何一层都能"拦下"请求：

```
请求 ──▶ ① 中间件 Middleware（helmet / compression / cookie-parser）
      ──▶ ② 守卫 Guard（登录了吗？有权限吗？）        ← 401/403 在这里产生
      ──▶ ③ 管道 Pipe（参数转换与校验）               ← 400 在这里产生
      ──▶ ④ Controller（路由到方法）
      ──▶ ⑤ Service（业务逻辑）                       ← 业务异常在这里抛出
      ──▶ ⑥ 拦截器 Interceptor（把结果包一层再返回）
      ──▶ ⑦ 异常过滤器 Filter（把异常转成统一错误格式）
      ──▶ 响应
```

### ① 中间件：main.ts 里的全局配置

看 [main.ts](../apps/api/src/main.ts)：

```ts
app.enableCors({ origin: origins, credentials: true }) // 只允许白名单域名跨域带 cookie
app.use(helmet()) // 设置一批安全响应头
app.use(compression()) // 响应体 gzip 压缩
app.use(cookieParser()) // 让 req.cookies 可用（读刷新令牌）
app.setGlobalPrefix('api/v1') // 所有路由统一前缀 /api/v1
```

> 所以前端请求的完整路径是 `http://localhost:3001/api/v1/articles`，`/api/v1` 就是这么来的。

### ② 守卫 Guard：先验身份再放行

```ts
@UseGuards(JwtAuthGuard)          // 必须登录，否则 401
@UseGuards(OptionalJwtAuthGuard)  // 登录了带上用户信息，没登录也不拦（游客可看）
```

项目里两个守卫都在 [auth/guards/](../apps/api/src/auth/guards/)。`OptionalJwtAuthGuard` 很值得看：它把校验失败**吞掉**，永远放行——这样"文章列表"一个接口既能给游客看，登录用户又能拿到"我点过赞吗"这类个性化字段。

### ③ 管道 Pipe：参数校验与转换

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // 剥掉 DTO 里没声明的字段
    transform: true, // 自动类型转换
    transformOptions: { enableImplicitConversion: true },
  }),
)
```

外加 `@Param('id', ParseIntPipe)`：URL 里的 `"1"` 是字符串，`ParseIntPipe` 把它转成数字 `1`，转不了直接 400。

### ④⑤ Controller → Service：见第 2 章。

### ⑥ 拦截器：统一"包装"成功响应

[transform.interceptor.ts](../apps/api/src/common/interceptors/transform.interceptor.ts) 给所有成功响应套一层 `{ data: ... }`：

```ts
map((result) => {
  if (result && typeof result === 'object' && 'data' in result) return result
  return { data: result }
})
```

所以后端方法 `return { id: 1, title: '...' }`，前端实际收到的是 `{ "data": { "id": 1, ... } }`。前端 [useApi.ts](../apps/web/composables/useApi.ts) 里那句 `response._data?.data ?? response._data` 就是专门剥这层的。

### ⑦ 异常过滤器：统一"包装"错误响应

[http-exception.filter.ts](../apps/api/src/common/filters/http-exception.filter.ts) 把各种异常转成统一格式：

```json
{ "statusCode": 404, "code": "ARTICLE_NOT_FOUND", "message": "文章不存在" }
```

Service 里抛出 `new NotFoundException({ code: ErrorCodes.ARTICLE_NOT_FOUND, message: '文章不存在' })`，过滤器负责转格式；前端拿到 `code` 后去 i18n 找对应文案（`errors.ARTICLE_NOT_FOUND`）。**这就是一个完整的前后端错误处理约定。**

> **练习**：把这几层按顺序默写一遍，然后打开 [articles.controller.ts](../apps/api/src/articles/articles.controller.ts)，指出每个装饰器属于哪一层。

---

## 第 4 章：DTO 与数据校验——永远不信任前端

**第一个后端原则：前端传过来的任何东西都可能是假的、错的、恶意的。** 前端校验是"体验"，后端校验是"底线"。

### DTO 是什么

DTO（Data Transfer Object）= 描述"这个接口期望收到什么形状的数据"的类。看 [create-article.dto.ts](../apps/api/src/articles/dto/create-article.dto.ts)：

```ts
export class CreateArticleDto {
  @ApiProperty({ example: 'Vue 3 组合式 API 实战' }) // 给 Swagger 看的
  @IsString() // 校验：必须是字符串
  @MinLength(2) // 至少 2 个字
  @MaxLength(200) // 最多 200 字
  title: string

  @IsOptional() // 可以不传
  @IsUrl() // 传了就必须是合法 URL
  cover?: string
  // ...
}
```

这些 `@IsXxx` 装饰器来自 `class-validator`；`ValidationPipe` 在请求进入 Controller 前自动执行它们，不通过就 400，并带上 `details`（哪几个字段错了）。

前端类比：像给组件 props 加了运行时的类型 + 范围校验，或者表单库的 rules——但**后端必须自己再校验一遍**，因为请求可以绕过你的页面直接用 curl / Postman 发出。

### 继承与组合：CursorPageDto

分页参数是所有列表接口共用的，项目把它抽成 [cursor-page.dto.ts](../apps/api/src/common/dto/cursor-page.dto.ts)：

```ts
export class CursorPageDto {
  @IsOptional()
  @IsString()
  cursor?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20
}
```

列表 DTO 直接继承它并加自己的字段，比如 [query-articles.dto.ts](../apps/api/src/articles/dto/query-articles.dto.ts)：

```ts
export class QueryArticlesDto extends CursorPageDto {
  @IsOptional()
  @IsEnum(['latest', 'hot'])
  sort?: 'latest' | 'hot' = 'latest'

  @IsOptional()
  @IsString()
  tag?: string
}
```

`whitelist: true` 还意味着：即使有人在请求体里塞 `{ "role": "admin" }` 这种 DTO 没声明的字段，也会被**直接剥掉**，进不了 Service。

> **前端视角**：你在前端写的列表查询参数（`sort`/`tag`/`cursor`/`limit`）和这里是同一个约定。接口文档（Swagger）里的参数表，也是从这些装饰器自动生成的。

---

## 第 5 章：数据库与 Prisma——数据到底存在哪

### 5.1 关系型数据库 5 分钟入门

PostgreSQL 里的数据长这样：

- **表（Table）**：一张二维表，比如 `users`、`articles`——类似 Excel 的一个 sheet；
- **行（Row）**：一条记录，比如一个用户；
- **列（Column）**：字段，有类型（字符串、整数、时间、数组……）；
- **主键（Primary Key）**：每行的唯一编号，项目里统一用自增整数 `id`；
- **外键（Foreign Key）**：指向另一张表的主键，比如 `articles.authorId → users.id`，用来表达"这篇文章属于那个用户"；
- **索引（Index）**：给某个列建"目录"，查询不用全表扫描。比如按 `status + publishedAt` 查文章列表；
- **唯一约束（Unique）**：该列（或几列组合）不能重复。比如邮箱、用户名，以及"一个人只能给一篇文章点一次赞"。

关系型数据库的"关系"就是这些表之间的连线：

- **一对多**：一个用户 → 多篇文章；一篇文章 → 多条评论；
- **多对多**：文章 ↔ 标签，靠中间表 `article_tags` 连接；
- **自关联**：评论回复评论（`comments.parentId → comments.id`）、关注（`follows.followerId / followeeId → users.id`）。

### 5.2 schema.prisma：数据库的"目录"

[prisma/schema.prisma](../apps/api/prisma/schema.prisma) 是**数据库结构的唯一事实来源**。挑几个模型看：

```prisma
model User {
  id           Int      @id @default(autoincrement())  // 主键，自增
  email        String   @unique                        // 唯一
  username     String   @unique
  passwordHash String                                  // 只存哈希，绝不存明文密码
  role         String   @default("user")               // "user" / "admin"
  createdAt    DateTime @default(now())
  articles     Article[]                               // 反向关系：这个用户的所有文章
  @@map("users")                                       // 数据库里的表名叫 users
}

model Article {
  id          Int      @id @default(autoincrement())
  authorId    Int
  author      User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  title       String   @db.VarChar(200)
  contentMd   String   @db.Text                        // Markdown 原文
  contentHtml String   @db.Text                        // 渲染并净化后的 HTML
  status      String   @default("draft")
  hotScore    Float    @default(0)                     // 热榜分数，定时任务重算
  tags        ArticleTag[]
  @@index([status, publishedAt])                       // 常用查询建索引
  @@index([status, hotScore])
  @@map("articles")
}
```

看懂这张表，就看懂了项目数据模型的一半。几个关键点：

| 写法                            | 含义                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| `@id @default(autoincrement())` | 主键、自增                                                   |
| `@unique`                       | 唯一约束（如 `[userId, articleId]` 组合唯一 = 不能重复点赞） |
| `@relation(...)`                | 外键关系；`onDelete: Cascade` 表示父记录删了，子记录跟着删   |
| `onDelete: Restrict`            | 有课程引用时，讲师不能删（`Teacher` 模型是这样）             |
| `@@index([...])`                | 组合索引，加速对应查询                                       |
| `@@map("...")`                  | 类名用单数大驼峰，表名用复数小写，两边都舒服                 |
| `String[]`                      | PostgreSQL 的数组类型（如课程的 `audience`）                 |

`@relation` 还有个细节：**带 `@relation(fields:...)` 的一侧才是真正存外键的一侧**，另一侧的 `Article[]` 只是方便查询的反向导航（数据库里不会多出列）。

### 5.3 迁移（Migration）：改表结构的正确姿势

想给表加个字段，**不要**手动去数据库里 `ALTER TABLE`，而是：

1. 改 `schema.prisma`；
2. 运行 `pnpm db:migrate`（底层是 `prisma migrate dev`）；
3. Prisma 自动对比差异，生成一个带时间戳的 SQL 文件放进 [prisma/migrations/](../apps/api/prisma/migrations/)，并把它应用到你的本地库。

比如加课程视频字段那次的迁移全文就只有一行：

```sql
-- AlterTable
ALTER TABLE "courses" ADD COLUMN "videoUrl" TEXT;
```

为什么要把 SQL 存成文件？因为**数据库结构也要版本管理**：你的电脑、同事的电脑、测试服务器、生产服务器，都按同样的顺序执行同样的迁移文件，保证结构完全一致。

两条命令要分清：

- `prisma migrate dev`：**开发时**用，生成新迁移 + 应用；
- `prisma migrate deploy`：**部署时**用，只应用"还没跑过"的迁移，重复执行安全。[deploy.sh](../deploy/deploy.sh) 里部署流程就会自动执行它。

### 5.4 Prisma Client：用 TS 代码操作数据库

迁移之后，Prisma 会根据 schema 生成一个类型完备的客户端（挂在 `PrismaService` 上，见 [prisma.service.ts](../apps/api/src/prisma/prisma.service.ts)）。之后所有数据库操作都是普通方法调用：

```ts
await this.prisma.article.findUnique({ where: { id } })            // 查一条
await this.prisma.article.findMany({ where, orderBy, take })       // 查多条
await this.prisma.article.create({ data: { ... } })                // 新增
await this.prisma.article.update({ where: { id }, data: { ... } }) // 更新
await this.prisma.article.delete({ where: { id } })                // 删除
await this.prisma.like.count({ where: { userId, articleId } })     // 计数
```

它比手写 SQL 好在：**参数自动防注入**、**返回值有类型提示**（`article.title` 有自动补全）、**关系可以一次查出来**。

几个项目里高频出现的进阶用法：

```ts
// 1. include / select：一次把关联数据查出来（避免 N+1 查询）
include: { author: { select: { id: true, username: true, avatar: true } }, tags: { include: { tag: true } } }

// 2. $transaction：多个操作"要么全成功，要么全失败"
await this.prisma.$transaction([
  this.prisma.like.delete({ where: { userId_articleId: { userId, articleId } } }),
  this.prisma.article.update({ where: { id: articleId }, data: { likeCount: { decrement: 1 } } }),
])

// 3. 原子自增/自减（并发安全）
data: { likeCount: { increment: 1 } }

// 4. 聚合与分组（课程分类统计）
await this.prisma.courseTag.groupBy({ by: ['tagId'], _count: { _all: true } })

// 5. 过滤计数（只数"仍在报名"的记录）
include: { _count: { select: { enrollments: { where: { status: 'enrolled' } } } } }
```

> **什么是 N+1 问题？** 先查 20 篇文章，再对每篇单独查一次作者，就是 1 + 20 次查询。用 `include` 让 Prisma 合并成更少的查询，是后端性能优化的第一课。

### 5.5 游标分页：为什么不用页码？

项目所有列表（文章流、评论、课程）都用 **cursor 分页**，而不是 `?page=2`。原因：数据在不停新增，页码分页会"漂移"（翻到第 2 页时，前面又发了新文章，导致你看到重复或漏掉的内容）；游标分页以"上一页最后一条"为锚点，稳定且性能好。

实现套路（[articles.service.ts](../apps/api/src/articles/articles.service.ts)）：

1. 多查一条（`take: limit + 1`），查出来比 limit 多，说明还有下一页；
2. 把最后一条的排序字段（如 `publishedAt` + `id`）编码成 cursor：`base64url(JSON.stringify({ p, id }))`；
3. 下一页请求带上 cursor，Service 解码后查询"排在它后面的"记录（`publishedAt < c.p OR (publishedAt = c.p AND id < c.id)`）。

前端拿到的 `{ items, nextCursor }` 里的 `nextCursor` 就是这串 base64；原样回传即可，不用理解内容。

### 5.6 种子数据与批量导入

- `pnpm db:seed` → 执行 [seed.ts](../apps/api/prisma/seed.ts)：清空并生成演示用户、标签、文章、讲师、课程，还会把文章同步进 Meilisearch；
- `pnpm --filter @devshare/api prisma:import` → [import-courses.ts](../apps/api/prisma/import-courses.ts)：从 `courses.example.json` 批量导入课程。

本地开发经常"库被我玩坏了"，直接重新 `db:migrate` + `db:seed` 就能回到干净状态。

### 5.7 项目里值得模仿的查询与设计

- **软删除 vs 硬删除**：项目用硬删除（`delete`），但取消报名用**状态位**（`status: 'canceled'`）：记录保留，报名人数只统计 `enrolled`——这就是"历史数据"和"当前状态"分开的典型做法；
- **冗余计数列**：`article.likeCount` 不是实时 `COUNT(*)` 算的，而是点赞时同步 `increment`——用一点一致性风险换查询性能。做这类设计时，务必把增减写进 `$transaction`；
- **幂等**：报名接口重复调用不会报错、不会重复写入（先查再决定 create / update），这是后端接口设计的好习惯——网络重试时用户不会莫名多出一条记录。

---

## 第 6 章：认证与授权——"你是谁"和"你能干嘛"

认证（Authentication）= 你是谁；授权（Authorization）= 你能不能做这件事。这是两个问题，项目用"双令牌 + 角色"解决。

### 6.1 密码：只存哈希，不存明文

看 [auth.service.ts](../apps/api/src/auth/auth.service.ts)：

```ts
const passwordHash = await bcrypt.hash(dto.password, 10) // 注册：哈希后入库
const ok = await bcrypt.compare(dto.password, user.passwordHash) // 登录：比对
```

- `bcrypt` 是**单向**哈希：能算 `hash(密码)`，但几乎不可能从哈希反推密码；
- 每个密码自带随机"盐"，同样密码两个人哈希结果也不同；
- 数据库里 `passwordHash` 即使被拖走，攻击者也很难还原出原始密码。

### 6.2 JWT：一张"签名过的会员卡"

JWT（JSON Web Token）是一段形如 `xxxxx.yyyyy.zzzzz` 的字符串，里面装着：

```json
{
  "sub": 1,
  "email": "a@b.com",
  "username": "gawain",
  "role": "user",
  "iat": 1750000000,
  "exp": 1750001800
}
```

- `sub` 是用户 id，`exp` 是过期时间；
- 服务器用密钥 `JWT_ACCESS_SECRET` 对它**签名**；
- 之后每次请求带上 `Authorization: Bearer <token>`，服务器验签即可确认"没被篡改 + 没过期"，**无需每次查库**。

签发的代码在 `buildAuthResult()`：`ACCESS_TOKEN_TTL_SECONDS` 默认 1800（30 分钟）——故意设得短，泄漏了也很快失效。

### 6.3 双令牌 + Cookie：为什么要两个 token

|          | accessToken                                    | refreshToken                              |
| -------- | ---------------------------------------------- | ----------------------------------------- |
| 作用     | 调接口的"通行证"                               | 换新 accessToken 的"续期凭证"             |
| 有效期   | 30 分钟                                        | 7 天                                      |
| 存放位置 | 前端内存 / localStorage，放 `Authorization` 头 | **httpOnly Cookie**，JS 读不到            |
| 形态     | JWT（自包含，签名验证）                        | 随机字符串（服务端 Redis 里查得到才算数） |

流程：

1. 登录成功 → 返回 accessToken，同时用 `Set-Cookie` 下发 refreshToken；
2. 30 分钟后 accessToken 过期 → 前端自动调 `POST /auth/refresh`，浏览器自动带上 Cookie；
3. 后端拿 refreshToken 去 Redis 查：存在就对，签发新的 accessToken（并把旧 refreshToken 删掉换新，叫**轮换**）；
4. 登出 → Redis 里删掉，令牌立即失效。

**为什么 refreshToken 要放 httpOnly Cookie？** 因为 JS 读不到它，XSS 偷不走；**为什么 accessToken 不放 Cookie？** 因为它要跨端使用（前端也可能在 SSR 里带头调用），放内存/头里更灵活。Cookie 还设了 `sameSite: 'lax'`（防 CSRF）、`path: '/api/v1/auth/refresh'`（只在刷新接口带上，缩小暴露面）、生产环境 `secure: true`（只走 HTTPS）。

### 6.4 Guard / Strategy / @CurrentUser：token 怎么变成 request.user

```
请求头 Bearer xxx
  → JwtAuthGuard（@UseGuards 触发）
  → Passport 的 JwtStrategy：用 JWT_ACCESS_SECRET 验签、检查过期
  → validate(payload) 返回 { id, email, username, role }
  → Nest 把它挂到 request.user
  → @CurrentUser() 装饰器把 request.user 取出来，作为方法参数
```

对应代码：[jwt.strategy.ts](../apps/api/src/auth/strategies/jwt.strategy.ts)、[jwt-auth.guard.ts](../apps/api/src/auth/guards/jwt-auth.guard.ts)、[current-user.decorator.ts](../apps/api/src/common/decorators/current-user.decorator.ts)。

> 注意：`JwtAuthGuard` 只负责"验明正身"，不查库。所以 token 合法但用户已被删除这种边缘情况，由 Service 处理。

### 6.5 授权：角色与"是不是本人"

验证完身份后，具体"能不能做"在 Service 里判断：

```ts
// 文章：作者本人或管理员才能编辑
if (existing.authorId !== user.id && user.role !== 'admin') {
  throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: '只能编辑自己的文章' })
}

// 课程：仅管理员
private assertAdmin(user: AuthenticatedUser): void {
  if (user.role !== 'admin') throw new ForbiddenException({ ... })
}
```

**任何接口都要问自己两个问题**：① 不登录能不能访问？② 登录了是不是只能操作自己的数据？项目里评论删除（作者 / 管理员 / 文章作者三种人都能删）、课程管理（仅 admin）、收藏列表（仅本人可见）都是这个思路。

### 6.6 前端一侧的配合

看 [useApi.ts](../apps/web/composables/useApi.ts)：

- 每次请求自动带 `Authorization: Bearer ${auth.token}`；
- `credentials: 'include'` 让浏览器带上 refresh Cookie；
- 收到 `code === 'UNAUTHORIZED'` 时，自动调 refresh 再**重放原请求**一次，用户无感知；
- 仍失败才提示并登出。

这就是"双令牌"方案的前端闭环。SSR 时（`import.meta.server`）用的是服务端直连地址，浏览器里走同源 `/api/v1`——两套 baseURL 的原因见第 12 章。

---

## 第 7 章：Redis——后端世界的"内存缓存"

### 7.1 它是什么

Redis 是一个**键值（key-value）内存数据库**，你可以把它想成"后端的 localStorage"：

- 数据放内存，读写极快（微秒级）；
- 数据结构简单：`SET key value`、`GET key`、`INCR key`（原子加一）、`DEL key`；
- 可以给 key 设**过期时间（TTL）**，到期自动删除；
- 通常**不当作唯一数据源**——它挂了，应用要能降级继续跑。

项目把它包成了 [RedisService](../apps/api/src/redis/redis.service.ts)，最值得学的是它的**降级设计**：

```ts
get available(): boolean {
  return this.client?.status === 'ready'
}
async get(key: string): Promise<string | null> {
  if (!this.available) return null   // Redis 没配置/挂了，当作"没有缓存"，不抛错
  return this.guard().get(key)
}
```

也就是说：**Redis 是可选的**。没配 `REDIS_URL` 时，读缓存返回 null、写缓存静默跳过，功能照常，只是性能差一点。

### 7.2 项目里的三种用法

| 用途           | key 设计                             | 说明                                            |
| -------------- | ------------------------------------ | ----------------------------------------------- |
| 文章浏览计数   | `views:{articleId}` + `INCR`         | 每次读文章 +1，先记在 Redis，不直接压数据库     |
| 刷新令牌白名单 | `refresh:{token}` → userId，TTL 7 天 | 能不能刷新，以 Redis 里在不在为准（可随时吊销） |
| 热榜缓存       | `rank:hot:v1`，TTL 600 秒            | 榜单先查缓存，没有才现算并回写                  |

浏览计数的完整链路很典型（[articles.service.ts](../apps/api/src/articles/articles.service.ts)）：

```ts
const viewDelta = await this.redis.incr(`views:${id}`) // 详情页 +1
// 列表接口：一次 MGET 拿一批增量，展示时 DB 值 + 增量
const deltas = await this.redis.mget(rows.map((r) => `views:${r.id}`))
viewCount: row.viewCount + Number(deltas[i] ?? 0)
```

**为什么不直接 `UPDATE articles SET viewCount = viewCount + 1`？** 因为详情页是高频读接口，每次读都写库会让数据库压力倍增。先累加在内存里，再由定时任务（下一章）批量落库，这叫 **write-behind（写回）** 策略。

> **缓存三连坑**（本项目用 TTL 规避了大部分）：
> **穿透**（总查不存在的数据 → 加空值缓存/布隆过滤器）、**击穿**（热点 key 过期瞬间全打到库 → 互斥锁/逻辑过期）、**雪崩**（大批 key 同时过期 → TTL 加随机抖动）。

### 7.3 key 与 TTL 的约定

- key 用冒号分层：`refresh:xxx`、`views:12`、`rank:hot:v1`（`v1` 是版本号，算法改了换 v2，避免读到旧结构）；
- 凡是"临时数据"都设 TTL，不允许无限增长；
- 存对象就 `JSON.stringify`，项目封装了 `getJson/set` 自动处理。

---

## 第 8 章：定时任务与热榜算法

### 8.1 node-cron：后端的"定时器"

看 [rank.service.ts](../apps/api/src/rank/rank.service.ts)：

```ts
onModuleInit() {
  cron.schedule('0 * * * *', () => { void this.recompute() })  // 每小时整点跑一次
}
```

`'0 * * * *'` 是 cron 表达式：分 时 日 月 周 —— 5 个位置。`0 * * * *` 表示"每小时的第 0 分钟"。`onModuleInit` 是 Nest 的生命周期钩子：模块初始化时执行（类似前端的 `onMounted`）。

这个定时任务做两件事：

1. **重算热榜分** `hotScore`：

```ts
const base =
  Math.log(viewCount + 1) * 1 +
  Math.log(likeCount + 1) * 8 +
  Math.log(collectCount + 1) * 10 +
  Math.log(commentCount + 1) * 12
const hotScore = base / Math.pow(ageHours + 2, 1.5)
```

- 互动越多分越高，点赞/收藏/评论权重不同（评论最"贵"）；
- 用 `log` 是为了"抑制大数"：10000 次浏览不该是 100 次浏览的 100 倍分；
- 除以 `(ageHours + 2)^1.5` 是**时间衰减**：越老的内容分越低，给新内容机会。

2. **把 Redis 里的浏览增量合并回数据库**：遍历 `views:*`，`increment` 到 `viewCount`，然后删 key（清零，下个小时重新累计）。

**为什么不在每次请求时算热榜？** 因为要遍历所有文章、做全表更新。放到每小时一次的离线任务里，读接口只做一次 `ORDER BY hotScore DESC`（还有索引），快得多。这就是"**读写分离思想**"在单机上的朴素体现。

---

## 第 9 章：全文搜索 Meilisearch

### 9.1 为什么不用 SQL 的 LIKE

`WHERE title LIKE '%vue%'` 的问题：没有分词（搜"组合式 API"匹配不到分开的词）、没有相关性排序、数据量大时全表扫描。Meilisearch 是专门的搜索引擎，**核心概念是倒排索引**：把"每个词出现在哪些文档"预先建好表，查询时直接查这个词的文档列表，毫秒级返回并按相关度排序。

### 9.2 项目怎么用它

看 [search.service.ts](../apps/api/src/search/search.service.ts)：

1. **启动时配置索引**：告诉引擎哪些字段参与搜索、哪些能过滤/排序：

```ts
await articles.updateSettings({
  searchableAttributes: ['title', 'summary', 'tagSlugs', 'authorUsername'],
  filterableAttributes: ['tagSlugs', 'status'],
  sortableAttributes: ['publishedAt'],
})
```

2. **启动时全量回填**（`reindexAll`）：把 DB 里已有的已发布文章 / 用户灌进索引——否则 seed 出来的历史文章永远搜不到；
3. **增量同步**：文章发布 / 更新时 `indexArticle(id)`，删除时 `removeArticle(id)`；
4. **查询 + 兜底**：

```
搜索请求 → Meilisearch 命中 → 拿 id 列表 → 回 Prisma 查完整数据
           Meilisearch 没命中/挂了 → 用 PostgreSQL 的 contains 模糊查
```

兜底逻辑的注释特别值得读：搜索引擎的索引可能**落后于数据库**（比如 seed 直接写库、绕过了 API 的同步逻辑）。所以代码在"索引返回 0 条"时并不直接认定"搜不到"，而是回落到数据库再查一次。**分布式系统里"两个数据源要同步"是永恒的难题**，这个兜底就是一种务实的处理：接受短暂不一致，但保证最终能搜到。

> 前端视角：搜索接口返回的还是 `ArticleListItem`，和首页文章流一模一样——搜索对前端是透明的。

---

## 第 10 章：文件上传——浏览器直传 OSS + STS

这是整个项目里**最"后端"也最值得前端了解**的一块：图片和视频的上传链路。

### 10.1 传统上传 vs 直传

```
传统：浏览器 ──文件体──▶ NestJS（multer 收进内存）──▶ 磁盘/OSS
      问题：大视频先把服务器内存/带宽吃满；nginx 还有 client_max_body_size 限制

直传：浏览器 ──只问凭证──▶ NestJS ──返回 STS 临时凭证──▶ 浏览器
      浏览器 ──文件体──────────────────────────────────▶ OSS（文件不经过服务器）
```

直传的好处：4GB 的视频也不占 Node 和 nginx 一个字节；上传进度、断点续传由浏览器端 SDK 负责；服务器只做"发钥匙"这一件轻活。

### 10.2 STS 临时凭证：不把长期密钥交给前端

服务器的 `OSS_ACCESS_KEY_ID/SECRET` 是长期密钥，**绝对不能下发到浏览器**。项目用阿里云 STS 服务换一张**临时凭证**（[uploads.service.ts](../apps/api/src/uploads/uploads.service.ts)）：

```ts
const policy = {
  Version: '1',
  Statement: [
    {
      Effect: 'Allow',
      Action: ['oss:PutObject', 'oss:AbortMultipartUpload', 'oss:ListParts'],
      Resource: ['acs:oss:*:*:' + oss.bucket + '/' + key], // 只放行这一个对象
    },
  ],
}
const { credentials } = await sts.assumeRole(roleArn, policy, duration, sessionName)
```

**最小权限原则**在这里体现得淋漓尽致：临时凭证被**会话策略钉死在单个对象名上**，只能上传这一个文件，即使泄漏，爆炸半径也就这一个对象；有效期默认 3600 秒，过期即废。

### 10.3 服务端做了什么校验

即使只是"发钥匙"，后端也把住了几道关：

- **对象名由服务端生成**：`uploads/images/2026/10/<uuid>.jpg`，不接受前端自定义路径；
- **续签时复用 key**：前端把首次签发的 key 带回来，服务端用正则校验形状（[uploads.service.ts](../apps/api/src/uploads/uploads.service.ts) 里的 `IMAGE_KEY_PATTERN`），防止借续签写任意路径；
- **MIME 白名单**：图片只收 jpeg/png/webp/gif/avif，视频只收 mp4/webm；
- **扩展名由 MIME 推导**：不信任文件名，避免 `../../evil.sh` 这类路径穿越；
- **图片不限 admin，视频仅 admin**：头像/封面人人要传，课程视频是管理功能。

### 10.4 为什么图片不收 SVG？

[shared 的常量](../packages/shared/src/index.ts)里注释写了：SVG 是"可以执行脚本的 XML 文档"，上传后从 OSS 域名加载，就是一个**存储型 XSS** 入口。这类"看起来是图片、实际是脚本"的文件还有 HTML、SWF 等，后端白名单是唯一的防线。

### 10.5 前端侧的实现

[useUpload.ts](../apps/web/composables/useUpload.ts) 的流程：

1. `GET /uploads/image/config` 或 `/video/config` → 拿到 `{ enabled, maxBytes, accept }`；
2. 检查文件大小 / 类型（体验层校验）；
3. `POST .../sts` 拿临时凭证；
4. 动态加载 `ali-oss` SDK，`multipartUpload` 直传 OSS，带进度回调；
5. SDK 在凭证快过期时自动调 `refreshSTSToken` 续签（**必须带上原 key**）；
6. 上传成功得到 `publicUrl + '/' + key`，把这个 URL 存进文章封面 / 课程视频字段。

> 体会一下这条链路里的分工：**后端管"规则与授权"（能不能传、传多大、传去哪），前端管"执行"（真的传输文件）**。这是现代大文件上传的标准姿势。

---

## 第 11 章：安全——后端必须守住的底线

前端同学转后端最容易忽略的就是这章。挑项目里真实存在的措施讲：

| 威胁              | 项目里的防线                                                         | 在哪看                                                                              |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 密码泄漏          | bcrypt 哈希 + 盐，不存明文                                           | [auth.service.ts](../apps/api/src/auth/auth.service.ts)                             |
| 令牌被偷          | accessToken 短寿命 + refreshToken httpOnly Cookie + 轮换             | [auth.controller.ts](../apps/api/src/auth/auth.controller.ts)                       |
| 暴力破解 / 刷接口 | 限流：全局 120 次/分；登录 10 次/分；注册 5 次/分                    | [app.module.ts](../apps/api/src/app.module.ts)、`@Throttle`                         |
| 跨站脚本 XSS      | Markdown 渲染后过 `xss` 白名单；上传不收 SVG                         | [markdown.util.ts](../apps/api/src/articles/markdown.util.ts)                       |
| 跨域滥用          | CORS 白名单（`CORS_ORIGINS` 环境变量），且只对白名单放开 credentials | [main.ts](../apps/api/src/main.ts)                                                  |
| 越权操作          | 每个写接口都查"是不是本人/管理员"                                    | 各 Service 的 `assertAdmin` / `authorId !== user.id`                                |
| SQL 注入          | 全程 Prisma 参数化查询，不拼 SQL 字符串                              | 所有 Service                                                                        |
| 恶意参数          | DTO + ValidationPipe 白名单校验，多余字段直接剥掉                    | [create-article.dto.ts](../apps/api/src/articles/dto/create-article.dto.ts)         |
| 响应头攻击        | helmet 设置安全响应头                                                | [main.ts](../apps/api/src/main.ts)                                                  |
| 密钥泄漏          | 密钥全走环境变量，`.env` 在 `.gitignore` 里                          | [apps/api/.env.example](../apps/api/.env.example)                                   |
| 内部细节泄漏      | 过滤器统一错误格式；OSS 报错只写服务端日志                           | [http-exception.filter.ts](../apps/api/src/common/filters/http-exception.filter.ts) |

再强调两个原则：

1. **默认拒绝**：接口默认要登录（或显式用 `OptionalJwtAuthGuard` 开放），字段默认被剥掉，上传默认只允许白名单格式；
2. **纵深防御**：同一件事在多层各防一遍（前端校验体积，后端 config 也查；nginx 有体积上限，OSS 策略再限）。

---

## 第 12 章：配置与环境变量——同一份代码怎么跑在不同环境

### 12.1 环境变量：不写死在代码里的配置

数据库密码、JWT 密钥、OSS 密钥……这些东西**不能写进代码提交到 git**，而是通过环境变量注入。开发时放在 `.env` 文件里（已在 `.gitignore`），部署时由 Docker Compose 注入。

项目里有两层 `.env`：

| 文件                                                               | 给谁读          | 内容                                              |
| ------------------------------------------------------------------ | --------------- | ------------------------------------------------- |
| 根目录 `.env`（从 [.env.example](../.env.example) 复制）           | docker compose  | Postgres 账号密码、JWT 密钥、OSS 配置…            |
| [apps/api/.env.example](../apps/api/.env.example)（复制为 `.env`） | 本地跑 API 时读 | `DATABASE_URL`、`REDIS_URL`、`JWT_ACCESS_SECRET`… |

> 注意 README 里的提醒：改了根 `.env` 的 `POSTGRES_PASSWORD`，要同步改 `apps/api/.env` 里 `DATABASE_URL` 的密码，否则连不上库。

代码里通过 `ConfigService` 读取（[auth.service.ts](../apps/api/src/auth/auth.service.ts) 等）：

```ts
this.config.get<string>('JWT_ACCESS_SECRET') ?? 'devshare-access-secret-change-me'
```

`?? 默认值` 是常见写法：开发环境不配也能跑；生产环境必须配真值（[.env.prod.example](../.env.prod.example) 里有强密码示例模板）。

### 12.2 前端怎么找到后端：三个地址的接力

同一个 API，在不同环节用不同地址访问，这是新手最容易绕晕的点：

| 场景                       | 请求方      | 地址                                               | 配置位置                                                         |
| -------------------------- | ----------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 本地开发（浏览器交互）     | 浏览器      | `/api/v1/...`（同源，被 Nuxt devProxy 转发）       | [nuxt.config.ts](../apps/web/nuxt.config.ts) 的 `nitro.devProxy` |
| 本地开发（SSR 服务端渲染） | Nuxt 服务端 | `http://127.0.0.1:3001/api/v1`                     | `runtimeConfig.apiBase`                                          |
| 生产（浏览器）             | 浏览器      | `/api/v1/...`（同源，被 nginx 转发到 api 容器）    | [deploy/nginx.conf](../deploy/nginx.conf)                        |
| 生产（SSR）                | Nuxt 容器   | `http://api:3000/api/v1`（容器内网，服务名当域名） | [docker-compose.yml](../docker-compose.yml) 的 `NUXT_API_BASE`   |

为什么浏览器侧始终是**同源相对路径**？因为同源就不存在跨域问题，Cookie 也顺；而 SSR 侧走内网直连，绕开公网和 nginx，快且稳。前端 [useApi.ts](../apps/web/composables/useApi.ts) 里 `import.meta.server ? config.apiBase : config.public.apiBase` 就是对这两种情况的判断。

---

## 第 13 章：Docker 与部署——后端程序怎么上服务器

### 13.1 容器是什么

**镜像（Image）** = 装好一切的"安装盘"（操作系统 + Node + 依赖 + 你的代码）；**容器（Container）** = 镜像跑起来的"实例"（像进程）。**Docker Compose** = 用一个 YAML 定义"一组容器怎么配合"。

看 [docker-compose.yml](../docker-compose.yml)（文件里已有大段新手注释，强烈建议通读），一整套系统由 7 个服务组成：

```
                    ┌──────────────────────────────┐
浏览器 ──▶ nginx ──▶│ /      → web (Nuxt, 3000)     │
                    │ /api/  → api (NestJS, 3000)   │
                    └──────────────────────────────┘
                            │            │
              ┌─────────────┼────────────┐
              ▼             ▼            ▼
         postgres        redis      meilisearch
```

几个关键概念：

- **服务名就是域名**：compose 里 `DATABASE_URL` 写 `@postgres:5432`、`NUXT_API_BASE` 写 `http://api:3000`——同网络容器间直接用服务名互访，不用记 IP；
- **端口映射** `'127.0.0.1:5432:5432'`：宿主端口:容器端口；`127.0.0.1` 前缀表示只允许本机连（数据库不暴露公网）；
- **数据卷（volume）**：`pgdata:/var/lib/postgresql/data` 把数据存在 Docker 管理的位置，容器重建数据不丢；
- **健康检查（healthcheck）**：API 靠 `GET /api/v1/health` 判断自己活着（[health.controller.ts](../apps/api/src/health/health.controller.ts)），`depends_on: condition: service_healthy` 保证启动顺序（数据库先就绪，API 才启动）；
- **变量插值** `${POSTGRES_PASSWORD:-默认值}`：从 `.env` 读取，换一个 `.env` 就是另一套环境。

### 13.2 API 镜像怎么构建

[apps/api/Dockerfile](../apps/api/Dockerfile) 是**多阶段构建**（multi-stage）：`deps` 装依赖 → `build` 编译 TS、生成 Prisma Client → `runtime` 只拷贝产物（体积小、不含源码和 devDependencies）。里面有一些和 Prisma 斗智斗勇的拷贝步骤（`pnpm deploy` 不会自动带上生成的客户端），属于工程细节，知道"镜像的最终产物是能直接 `node dist/main.js` 的最小集合"就够了。

### 13.3 部署时迁移怎么执行

[deploy.sh](../deploy/deploy.sh) 的流程：拉新镜像 → 起容器 → 健康检查 → **`npx prisma migrate deploy`**（在 api 容器里执行）。所以新版本带迁移文件上去后，表结构会自动升级——这也是"迁移文件必须提交进 git"的原因。

> 与前端部署的对照：前端构建产物是静态文件 + SSR 服务；后端"构建产物 + 数据库结构"要一起升级，且**数据库迁移只能向前**（回滚代码容易，回滚表结构危险），所以迁移要先在 staging 验证。

---

## 第 14 章：后端测试——怎么证明逻辑是对的

### 14.1 Jest 与测试文件约定

后端用 **Jest**（前端用 Vitest，两套工具，写法相似）。测试文件和被测代码同目录：`articles.service.ts` ↔ `articles.service.spec.ts`（`*.spec.ts` 是约定）。跑测试：

```powershell
pnpm --filter @devshare/api test          # 单元测试
pnpm --filter @devshare/api test:e2e      # 端到端测试
```

### 14.2 单元测试：把依赖"换成假的"

看 [articles.service.spec.ts](../apps/api/src/articles/articles.service.spec.ts) 的套路：

```ts
const prisma = {
  article: { findMany: jest.fn(), create: jest.fn(), ... },
  like: { count: jest.fn().mockResolvedValue(0) },
}
const redis = { incr: jest.fn().mockResolvedValue(1), mget: jest.fn().mockResolvedValue([]) }

const moduleRef = await Test.createTestingModule({
  providers: [
    ArticlesService,
    { provide: PrismaService, useValue: prisma },   // 注入假 Prisma
    { provide: RedisService, useValue: redis },     // 注入假 Redis
  ],
}).compile()
```

`jest.fn()` 是"假的函数"，可以指定返回值、记录调用参数、断言"有没有被调用"。这样测 Service 不需要真的数据库——**快、稳、不受环境影响**。然后 `expect(...)` 断言结果，比如"创建文章时把 Markdown 渲染成了 HTML、状态是 draft"。

### 14.3 端到端测试（e2e）

[test/app.e2e-spec.ts](../apps/api/test/app.e2e-spec.ts) 用 **supertest** 起一个真实 HTTP 服务发请求，验证"路由 → 守卫 → 校验 → 服务 → 响应格式"整条链路。它更接近真实，但慢，所以只覆盖关键路径。

### 14.4 后端测试和后端开发的关系

- 改 Service 逻辑 → 跑 spec，靠假 Prisma 快速验证分支；
- 改 DTO / Guard / 过滤器 → e2e 才能覆盖；
- 项目里的 [markdown.util.ts](../apps/api/src/articles/markdown.util.ts) 测试专门断言 `<script>` 被过滤——**安全逻辑必须测试**，否则哪天换个参数就悄悄失效了。

---

## 第 15 章：把一切串起来——"点赞"的全链路

用一次点赞，把前面所有章节过一遍：

1. **前端**：用户点"点赞"按钮 → `api.post('/articles/1/like')`（[useApi.ts](../apps/web/composables/useApi.ts)）；
2. **网络**：浏览器带上 `Authorization: Bearer <accessToken>`，请求 `/api/v1/articles/1/like`（同源 → devProxy / nginx 转发）；
3. **NestJS 入口**：全局 `ThrottlerGuard` 限流 → 路由匹配 `POST articles/:id/like` → `JwtAuthGuard` 验 token → `ParseIntPipe` 把 `'1'` 转成 `1` → `@CurrentUser()` 拿到 `{ id: 7, role: 'user' }`；
4. **Service**（[articles.service.ts](../apps/api/src/articles/articles.service.ts)）：
   - `ensureExists` 查文章，没有 → 404 `ARTICLE_NOT_FOUND`；
   - 查 `likes` 表里有没有 `(userId=7, articleId=1)`；
   - 有 → `$transaction` 里删记录 + `likeCount` 减 1；没有 → 事务里加记录 + `likeCount` 加 1；
   - 返回 `{ liked: true, likeCount: 8 }`；
5. **响应**：`TransformInterceptor` 包成 `{ "data": { "liked": true, "likeCount": 8 } }`；如果抛了异常，`HttpExceptionFilter` 转成 `{ statusCode, code, message }`；
6. **前端收尾**：`useApi` 剥掉 `data` 层；页面把按钮状态和数字更新；如果 401，自动 refresh token 后重试；
7. **后续**：这次点赞让文章 `likeCount` 变了，下一小时的定时任务重算 `hotScore`（评论 ×12、收藏 ×10、点赞 ×8……），影响"热门"排序——**一次用户操作，最终会涟漪到榜单和搜索之外的各种读接口**。

如果这七步你都能在代码里指出对应文件，这份文档就可以毕业了。

---

## 术语速查表（前端对照版）

| 术语                 | 一句话解释                                                                               | 前端类比                                |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| API                  | 后端对外开放的接口集合                                                                   | 你 fetch 的那些 URL                     |
| REST                 | 用 HTTP 方法 + 资源路径表达操作（GET 查、POST 增、PATCH 改、DELETE 删）                  | 同一套 fetch 约定                       |
| JSON                 | 前后端交换数据的格式                                                                     | JS 对象，但键必须双引号                 |
| 状态码               | 200 成功 / 400 参数错 / 401 未登录 / 403 无权限 / 404 不存在 / 429 太频繁 / 500 服务器错 | 和前端拦截器里判断的一样                |
| DTO                  | 接口输入 / 输出的数据形状定义                                                            | props 类型 + 运行时校验                 |
| ORM                  | 用代码操作数据库的"翻译层"                                                               | 类似用对象操作 DOM（而不是直接写 HTML） |
| 迁移 Migration       | 数据库结构变更的版本化 SQL 文件                                                          | git commit，但对象是表结构              |
| 种子 Seed            | 初始化演示 / 基础数据的脚本                                                              | mock 数据，但写进真库                   |
| 关系                 | 表与表之间的关联（一对多、多对多）                                                       | 对象之间的引用                          |
| 索引 Index           | 加速查询的"目录"                                                                         | 给数组建 Map                            |
| 事务 Transaction     | 一组操作要么全成功要么全失败                                                             | `Promise.all` 但会整体回滚              |
| 缓存 Cache           | 把贵的查询结果暂存起来                                                                   | `computed` 缓存 + localStorage          |
| TTL                  | 缓存 / 令牌的存活时间                                                                    | 缓存过期策略                            |
| 限流 Rate Limit      | 限制单位时间的请求次数                                                                   | 防抖 / 节流，但发生在服务端             |
| 中间件 Middleware    | 请求处理前 / 后的通用处理                                                                | 路由守卫 / axios 拦截器                 |
| 守卫 Guard           | 进 Controller 前的身份 / 权限检查                                                        | 路由 meta + beforeEach                  |
| JWT                  | 签名过的登录凭证                                                                         | 一张防伪的"会员卡"字符串                |
| OSS / 对象存储       | 存图片视频的云存储                                                                       | 你项目里的 CDN 图片源                   |
| STS                  | 换取临时上传凭证的服务                                                                   | 用长期账号换一次性的"临时门禁卡"        |
| 环境变量             | 不写进代码的配置（密码、地址）                                                           | `.env` + `import.meta.env`              |
| 容器 Container       | 打包好一切的应用运行单元                                                                 | 一个隔离的"小程序"                      |
| 反向代理             | 站在最前面转发请求的服务器（nginx）                                                      | devProxy 的生产版                       |
| 健康检查 Healthcheck | 询问服务"你还活着吗"的接口                                                               | 你在意的"服务可用性"                    |
| SSR                  | 服务端渲染（这个项目首页/详情用）                                                        | Nuxt 的核心能力，你已经很熟             |

---

## 建议的学习路径（按顺序）

1. **跑起来**：按 [LOCAL_DEV.md](LOCAL_DEV.md) 起依赖 → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`，浏览器打开 `http://localhost:3001/api/docs` 玩一遍 Swagger；
2. **读入口**：[main.ts](../apps/api/src/main.ts) → [app.module.ts](../apps/api/src/app.module.ts)，对照第 3 章的洋葱模型；
3. **完整读一个简单模块**：[health](../apps/api/src/health/health.controller.ts) → [banners](../apps/api/src/banners/)（简单 CRUD）→ [articles](../apps/api/src/articles/)（完整业务）；
4. **读 auth 模块**：结合第 6 章，把 `register → login → me → refresh` 四个接口在 Swagger 里实际调一遍，观察 Cookie 和 Authorization 头；
5. **读 schema.prisma**：对着第 5 章的表，把各模型的关系画成 ER 图；
6. **读 rank 与 search**：理解"缓存 + 定时任务 + 兜底"这套组合拳；
7. **读 uploads**：理解直传链路，配合 [useUpload.ts](../apps/web/composables/useUpload.ts) 从两端看同一个功能。

## 动手实验建议

- **加一个字段**：给 `Banner` 加 `description`——要动 schema（迁移）、DTO、Service 映射、（可选）前端。体会"改数据模型要动几层"；
- **加一个接口**：`GET /articles/:id/related`（同标签的其它文章，最多 5 篇）——练 Controller + Service + Prisma 查询；
- **加一个测试**：给 `ArticlesService.toggleLike` 写单测——第一次点赞、取消点赞两个分支；
- **看一次请求全过程**：Swagger 里调 `GET /articles`，对照 Network 面板的响应体，指出 `{ data: ... }` 和 `nextCursor` 分别哪一层加上的；
- **踩一次坑**：故意在 `.env` 里改错 `DATABASE_URL`，观察启动报错和 [health 接口](../apps/api/src/health/health.controller.ts) 的 `db: false`。

## 参考

- [README.md](../README.md) —— 项目全貌与命令
- [NUXT_GUIDE.md](NUXT_GUIDE.md) —— 姊妹篇：前端指南
- [PITFALLS.md](PITFALLS.md) —— 踩坑记录（后端相关条目也值得看）
- [DEPLOY.md](DEPLOY.md) —— 部署全流程
- [NestJS 官方文档](https://docs.nestjs.com/) / [Prisma 官方文档](https://www.prisma.io/docs) —— 想深入时的第一手资料
