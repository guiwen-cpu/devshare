import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { BannersService } from './banners.service'

// Banner 的读接口是公开的、写接口仅管理员，权限与可见性是这个模块的主要风险点，
// 所以下面的用例按「列表可见性 / 鉴权 / 校验 / 默认值 / 404 语义」分组覆盖。
describe('BannersService', () => {
  let service: BannersService
  const prisma = {
    banner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef = await Test.createTestingModule({
      providers: [BannersService, { provide: PrismaService, useValue: prisma }],
    }).compile()
    service = moduleRef.get(BannersService)
  })

  const admin = { id: 1, email: 'admin@devshare.dev', username: 'admin', role: 'admin' }
  const user = { id: 2, email: 'user@devshare.dev', username: 'user', role: 'user' }

  const createdAt = new Date('2026-09-01T00:00:00.000Z')
  const updatedAt = new Date('2026-09-02T00:00:00.000Z')

  function row(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 7,
      title: 'AI 应用实战',
      subtitle: '一周上手 RAG',
      image: 'https://cdn.example.com/banner.png',
      link: '/courses/1',
      enabled: true,
      sortOrder: 0,
      createdAt,
      updatedAt,
      ...overrides,
    }
  }

  // ---- 列表可见性：匿名只读启用项，管理员才看得到停用项 ----
  it('lists only enabled banners for anonymous viewers', async () => {
    prisma.banner.findMany.mockResolvedValueOnce([row()])

    const result = await service.list()

    expect(prisma.banner.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    })
    expect(result).toEqual([
      {
        id: 7,
        title: 'AI 应用实战',
        subtitle: '一周上手 RAG',
        image: 'https://cdn.example.com/banner.png',
        link: '/courses/1',
        enabled: true,
        sortOrder: 0,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ])
  })

  it('includes disabled banners when an admin asks for all', async () => {
    prisma.banner.findMany.mockResolvedValueOnce([row({ enabled: false })])

    const result = await service.list(admin, true)

    expect(prisma.banner.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    })
    expect(result).toHaveLength(1)
  })

  it('ignores all=true for non-admin viewers', async () => {
    prisma.banner.findMany.mockResolvedValueOnce([])

    await service.list(user, true)

    expect(prisma.banner.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    })
  })

  // ---- 鉴权：非管理员在触达 prisma 之前就该被拦下 ----
  it('rejects non-admin users on create', async () => {
    await expect(
      service.create(user, { title: 'T', image: 'https://x/y.png', link: '/courses/1' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.banner.create).not.toHaveBeenCalled()
  })

  // ---- 写入校验：trim、默认值、link 白名单 ----
  it('creates a banner with defaults, trimming text fields', async () => {
    prisma.banner.create.mockResolvedValueOnce(row())

    await service.create(admin, {
      title: '  AI 应用实战  ',
      subtitle: '   ',
      image: ' https://cdn.example.com/banner.png ',
      link: ' /courses/1 ',
    })

    expect(prisma.banner.create).toHaveBeenCalledWith({
      data: {
        title: 'AI 应用实战',
        subtitle: null,
        image: 'https://cdn.example.com/banner.png',
        link: '/courses/1',
        enabled: true,
        sortOrder: 0,
      },
    })
  })

  it('accepts an external http(s) link', async () => {
    prisma.banner.create.mockResolvedValueOnce(row({ link: 'https://devshare.dev' }))

    await service.create(admin, {
      title: 'T',
      image: 'https://x/y.png',
      link: 'HTTPS://devshare.dev',
    })

    expect(prisma.banner.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ link: 'HTTPS://devshare.dev' }),
    })
  })

  it.each(['article/1', 'ftp://cdn.example.com/a.png', 'javascript:alert(1)'])(
    'rejects the unsupported link %s',
    async (link) => {
      await expect(
        service.create(admin, { title: 'T', image: 'https://x/y.png', link }),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.banner.create).not.toHaveBeenCalled()
    },
  )

  // ---- 更新：局部提交 + 目标不存在时的 404 语义 ----
  it('rejects non-admin users on update', async () => {
    await expect(service.update(user, 7, { title: 'T' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.banner.update).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when updating a missing banner', async () => {
    prisma.banner.findUnique.mockResolvedValueOnce(null)

    await expect(service.update(admin, 999, { title: 'T' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('only writes the fields present in the update payload', async () => {
    prisma.banner.findUnique.mockResolvedValueOnce(row())
    prisma.banner.update.mockResolvedValueOnce(row({ enabled: false }))

    const result = await service.update(admin, 7, { enabled: false })

    expect(prisma.banner.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { enabled: false },
    })
    expect(result.enabled).toBe(false)
  })

  it('validates the link on update', async () => {
    prisma.banner.findUnique.mockResolvedValueOnce(row())

    await expect(service.update(admin, 7, { link: 'courses/1' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(prisma.banner.update).not.toHaveBeenCalled()
  })

  // ---- 删除：同样先鉴权，再判存在 ----
  it('rejects non-admin users on remove', async () => {
    await expect(service.remove(user, 7)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.banner.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when removing a missing banner', async () => {
    prisma.banner.findUnique.mockResolvedValueOnce(null)

    await expect(service.remove(admin, 999)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('removes a banner', async () => {
    prisma.banner.findUnique.mockResolvedValueOnce(row())
    prisma.banner.delete.mockResolvedValueOnce(row())

    const result = await service.remove(admin, 7)

    expect(prisma.banner.delete).toHaveBeenCalledWith({ where: { id: 7 } })
    expect(result).toEqual({ success: true })
  })
})
