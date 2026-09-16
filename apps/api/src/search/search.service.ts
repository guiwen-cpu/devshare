import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MeiliSearch } from 'meilisearch'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name)
  private client: MeiliSearch | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const host = this.config.get<string>('MEILI_HOST')
    const apiKey = this.config.get<string>('MEILI_MASTER_KEY')
    if (!host) {
      this.logger.warn('MEILI_HOST not set, search falls back to PostgreSQL LIKE.')
      return
    }
    try {
      this.client = new MeiliSearch({ host, apiKey: apiKey ?? '' })
      const articles = this.client.index('articles')
      await articles.updateSettings({
        searchableAttributes: ['title', 'summary', 'tagSlugs', 'authorUsername'],
        filterableAttributes: ['tagSlugs', 'status'],
        sortableAttributes: ['publishedAt'],
      })
      await this.client.index('users').updateSettings({
        searchableAttributes: ['username', 'bio'],
      })
      await this.reindexAll()
      this.logger.log('Meilisearch connected and indexes configured.')
    } catch (e) {
      this.logger.warn(`Meilisearch init failed: ${(e as Error).message}`)
      this.client = null
    }
  }

  get available(): boolean {
    return this.client !== null
  }

  async indexArticle(articleId: number): Promise<void> {
    if (!this.client) return
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: {
        author: { select: { username: true } },
        tags: { include: { tag: { select: { slug: true } } } },
      },
    })
    if (!article || article.status !== 'published') return
    await this.client.index('articles').addDocuments([
      {
        id: article.id,
        title: article.title,
        summary: article.summary ?? '',
        tagSlugs: article.tags.map((t) => t.tag.slug),
        authorUsername: article.author.username,
        status: 'published',
        publishedAt: article.publishedAt?.getTime() ?? article.createdAt.getTime(),
      },
    ])
  }

  async removeArticle(articleId: number): Promise<void> {
    if (!this.client) return
    await this.client.index('articles').deleteDocument(articleId)
  }

  async indexUser(userId: number): Promise<void> {
    if (!this.client) return
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    await this.client
      .index('users')
      .addDocuments([{ id: user.id, username: user.username, bio: user.bio ?? '' }])
  }

  // 每次服务启动时把库里的存量文章/用户补进索引。
  // 否则 seed 出的历史文章永远不会出现在搜索里（indexArticle 只在新发布时触发）。
  // 文档以 id 为主键，重复添加会覆盖旧文档，因此可以放心全量重建。
  async reindexAll(): Promise<void> {
    if (!this.client) return
    const articles = await this.prisma.article.findMany({
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
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, bio: true },
    })
    if (articles.length > 0) {
      await this.client.index('articles').addDocuments(
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
      await this.client
        .index('users')
        .addDocuments(users.map((u) => ({ id: u.id, username: u.username, bio: u.bio ?? '' })))
    }
    this.logger.log(`Meilisearch backfilled: ${articles.length} articles, ${users.length} users.`)
  }

  async searchArticles(q: string, limit = 20): Promise<{ ids: number[]; total: number }> {
    if (this.client) {
      try {
        const result = await this.client
          .index('articles')
          .search(q, { limit, filter: ['status = published'] })
        const ids = result.hits.map((h) => Number((h as { id: number }).id))
        // 只有真的命中才信任索引结果。一条都没命中时不能直接当成「没搜到」：
        // 索引可能落后于数据库（典型场景是 prisma db seed / 手工写库绕过了 API，
        // 不会触发 indexArticle 增量索引），此时回落到 PostgreSQL 再查一次，
        // 保证库里已有的数据一定搜得到。
        if (ids.length > 0) return { ids, total: result.estimatedTotalHits ?? ids.length }
      } catch (e) {
        this.logger.warn(`Meilisearch search failed, fallback: ${(e as Error).message}`)
      }
    }
    return this.searchArticlesFromDb(q, limit)
  }

  // 兜底：PostgreSQL 大小写不敏感 + 分词模糊匹配。
  // 把关键词按空白拆成多个词，每个词都要在「标题/摘要/作者名/标签」任一字段中出现，
  // 既保证大小写兼容（TypeScript / typescript 都能搜到），也支持多词部分匹配。
  private async searchArticlesFromDb(
    q: string,
    limit: number,
  ): Promise<{ ids: number[]; total: number }> {
    const words = q.trim().split(/\s+/).filter(Boolean)
    const andGroups = words.map((word) => ({
      OR: [
        { title: { contains: word, mode: 'insensitive' as const } },
        { summary: { contains: word, mode: 'insensitive' as const } },
        { author: { username: { contains: word, mode: 'insensitive' as const } } },
        {
          tags: {
            some: {
              tag: {
                OR: [
                  { name: { contains: word, mode: 'insensitive' as const } },
                  { slug: { contains: word, mode: 'insensitive' as const } },
                ],
              },
            },
          },
        },
      ],
    }))
    const rows = await this.prisma.article.findMany({
      where: {
        status: 'published',
        AND: andGroups,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true },
    })
    return { ids: rows.map((r) => r.id), total: rows.length }
  }

  async searchUsers(q: string, limit = 10): Promise<{ ids: number[]; total: number }> {
    if (this.client) {
      try {
        const result = await this.client.index('users').search(q, { limit })
        const ids = result.hits.map((h) => Number((h as { id: number }).id))
        // 同 searchArticles：索引空命中时回落到数据库，避免索引滞后导致搜不到用户。
        if (ids.length > 0) return { ids, total: result.estimatedTotalHits ?? ids.length }
      } catch (e) {
        this.logger.warn(`Meilisearch user search failed, fallback: ${(e as Error).message}`)
      }
    }
    return this.searchUsersFromDb(q, limit)
  }

  private async searchUsersFromDb(
    q: string,
    limit: number,
  ): Promise<{ ids: number[]; total: number }> {
    const words = q.trim().split(/\s+/).filter(Boolean)
    const andGroups = words.map((word) => ({
      OR: [
        { username: { contains: word, mode: 'insensitive' as const } },
        { bio: { contains: word, mode: 'insensitive' as const } },
      ],
    }))
    const rows = await this.prisma.user.findMany({
      where: { AND: andGroups },
      take: limit,
      select: { id: true },
    })
    return { ids: rows.map((r) => r.id), total: rows.length }
  }
}
