import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { SearchService } from './search.service'
import { PrismaService } from '../prisma/prisma.service'

// Meilisearch 客户端整体打桩：每个 index() 返回同一组 jest.fn()
const search = jest.fn()
const addDocuments = jest.fn()
const updateSettings = jest.fn()

jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: () => ({ search, addDocuments, updateSettings }),
  })),
}))

describe('SearchService', () => {
  const prisma = {
    article: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  }

  async function buildService(meiliHost?: string): Promise<SearchService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'MEILI_HOST' ? meiliHost : 'test-meili-master-key',
            ),
          },
        },
      ],
    }).compile()
    const service = moduleRef.get(SearchService)
    // 手动触发生命周期：onModuleInit 里会连 Meilisearch 并做存量回填
    await service.onModuleInit()
    // 清掉初始化阶段产生的调用记录，方便用例断言
    jest.clearAllMocks()
    return service
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // 存量回填默认查空库，避免污染用例
    prisma.article.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    updateSettings.mockResolvedValue({})
    addDocuments.mockResolvedValue({})
  })

  it('索引命中时直接返回索引结果，不再回查数据库', async () => {
    const service = await buildService('http://meili:7700')
    search.mockResolvedValueOnce({ hits: [{ id: 3 }, { id: 9 }], estimatedTotalHits: 2 })

    await expect(service.searchArticles('vue')).resolves.toEqual({ ids: [3, 9], total: 2 })
    expect(prisma.article.findMany).not.toHaveBeenCalled()
  })

  it('索引一条都没命中时回落数据库（seed / 手工写库绕过 API，索引没追上）', async () => {
    const service = await buildService('http://meili:7700')
    search.mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0 })
    prisma.article.findMany.mockResolvedValueOnce([{ id: 7 }, { id: 8 }])

    await expect(service.searchArticles('组合式 API')).resolves.toEqual({ ids: [7, 8], total: 2 })
    expect(prisma.article.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'published' }),
        select: { id: true },
      }),
    )
  })

  it('用户索引空命中时同样回落数据库', async () => {
    const service = await buildService('http://meili:7700')
    search.mockResolvedValueOnce({ hits: [], estimatedTotalHits: 0 })
    prisma.user.findMany.mockResolvedValueOnce([{ id: 5 }])

    await expect(service.searchUsers('LinDaiDai')).resolves.toEqual({ ids: [5], total: 1 })
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1)
  })

  it('Meilisearch 报错时回落数据库', async () => {
    const service = await buildService('http://meili:7700')
    search.mockRejectedValueOnce(new Error('meili down'))
    prisma.article.findMany.mockResolvedValueOnce([{ id: 1 }])

    await expect(service.searchArticles('docker')).resolves.toEqual({ ids: [1], total: 1 })
  })

  it('未配置 MEILI_HOST 时只查数据库', async () => {
    const service = await buildService(undefined)
    prisma.article.findMany.mockResolvedValueOnce([{ id: 2 }])

    await expect(service.searchArticles('redis')).resolves.toEqual({ ids: [2], total: 1 })
    expect(search).not.toHaveBeenCalled()
  })
})
