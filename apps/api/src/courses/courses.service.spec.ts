import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { CoursesService } from './courses.service'

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'AI 时代再学 Java（漫画版）',
    cover: null,
    summary: '前端转全栈必修',
    audience: ['前端转全栈', '零基础入门'],
    difficulty: 'beginner',
    badge: '新课',
    status: 'published',
    sortOrder: 0,
    teacherId: 1,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    teacher: { id: 1, name: '李老师', avatar: null, bio: '十年后端经验' },
    tags: [{ courseId: 1, tagId: 2, tag: { id: 2, name: 'AI', slug: 'ai' } }],
    _count: { enrollments: 34 },
    ...overrides,
  }
}

describe('CoursesService', () => {
  let service: CoursesService
  const prisma = {
    course: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    courseTag: { groupBy: jest.fn() },
    tag: { findMany: jest.fn() },
    teacher: { findUnique: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const moduleRef = await Test.createTestingModule({
      providers: [CoursesService, { provide: PrismaService, useValue: prisma }],
    }).compile()
    service = moduleRef.get(CoursesService)
  })

  const admin = { id: 1, email: 'admin@devshare.dev', username: 'admin', role: 'admin' }
  const user = { id: 2, email: 'user@devshare.dev', username: 'user', role: 'user' }

  const baseDto = {
    title: 'AI 时代再学 Java（漫画版）',
    difficulty: 'beginner' as const,
    teacherId: 1,
    tagIds: [2],
  }

  describe('feed', () => {
    it('only returns published courses for anonymous viewers', async () => {
      prisma.course.findMany.mockResolvedValueOnce([courseRow()])

      const result = await service.feed({})

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'published' },
          orderBy: [{ sortOrder: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
          take: 7,
        }),
      )
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toEqual({
        id: 1,
        title: 'AI 时代再学 Java（漫画版）',
        cover: null,
        summary: '前端转全栈必修',
        teacher: { id: 1, name: '李老师', avatar: null, bio: '十年后端经验' },
        tags: [{ id: 2, name: 'AI', slug: 'ai' }],
        difficulty: 'beginner',
        enrollCount: 34,
        badge: '新课',
        status: 'published',
        sortOrder: 0,
        publishedAt: '2026-01-01T00:00:00.000Z',
      })
      expect(result.nextCursor).toBeNull()
    })

    it('forces published status for non-admins asking for drafts', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ status: 'all', viewer: user })

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'published' } }),
      )
    })

    it('filters by tag slug', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ tag: 'ai' })

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'published', tags: { some: { tag: { slug: 'ai' } } } },
        }),
      )
    })

    it('matches a keyword against title, summary, teacher and tags', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ q: 'AI' })

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'published',
            AND: [
              {
                OR: [
                  { title: { contains: 'AI', mode: 'insensitive' } },
                  { summary: { contains: 'AI', mode: 'insensitive' } },
                  { teacher: { name: { contains: 'AI', mode: 'insensitive' } } },
                  {
                    tags: {
                      some: {
                        tag: {
                          OR: [
                            { name: { contains: 'AI', mode: 'insensitive' } },
                            { slug: { contains: 'AI', mode: 'insensitive' } },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      )
    })

    it('requires every whitespace-separated keyword to match', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ q: '  AI   李老师 ' })

      const where = prisma.course.findMany.mock.calls[0][0].where
      expect(where.AND).toHaveLength(2)
      expect(where.AND[0].OR[0].title.contains).toBe('AI')
      expect(where.AND[1].OR[0].title.contains).toBe('李老师')
    })

    it('ignores a blank keyword', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ q: '   ' })

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'published' } }),
      )
    })

    it('filters by difficulty only when one is given', async () => {
      prisma.course.findMany.mockResolvedValue([])

      await service.feed({ difficulty: 'advanced' })
      expect(prisma.course.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { status: 'published', difficulty: 'advanced' } }),
      )

      await service.feed({})
      expect(prisma.course.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { status: 'published' } }),
      )
    })

    it('keeps keyword, difficulty, tag and cursor conditions together', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])
      const cursor = Buffer.from(
        JSON.stringify({ o: 0, p: '2026-01-01T00:00:00.000Z', id: 3 }),
      ).toString('base64url')

      await service.feed({ q: 'ai', difficulty: 'beginner', tag: 'ai', cursor })

      const where = prisma.course.findMany.mock.calls[0][0].where
      expect(where.status).toBe('published')
      expect(where.difficulty).toBe('beginner')
      expect(where.tags).toEqual({ some: { tag: { slug: 'ai' } } })
      expect(where.AND).toHaveLength(1)
      expect(where.OR).toHaveLength(3)
    })

    it('keeps keyword filters but still forces published for non-admins', async () => {
      prisma.course.findMany.mockResolvedValueOnce([])

      await service.feed({ status: 'all', difficulty: 'advanced', q: 'ai', viewer: user })

      const where = prisma.course.findMany.mock.calls[0][0].where
      expect(where.status).toBe('published')
      expect(where.difficulty).toBe('advanced')
      expect(where.AND).toHaveLength(1)
    })

    it('returns a cursor when more rows exist', async () => {
      prisma.course.findMany.mockResolvedValueOnce([courseRow({ id: 3 }), courseRow({ id: 2 })])

      const result = await service.feed({ limit: 1 })

      expect(result.items).toHaveLength(1)
      expect(result.nextCursor).not.toBeNull()
      const decoded = JSON.parse(Buffer.from(result.nextCursor as string, 'base64url').toString())
      expect(decoded).toEqual({ o: 0, p: '2026-01-01T00:00:00.000Z', id: 3 })
    })

    it('uses an id-only cursor for admin draft listings', async () => {
      prisma.course.findMany.mockResolvedValueOnce([
        courseRow({ id: 9, status: 'draft', publishedAt: null }),
        courseRow({ id: 8, status: 'draft', publishedAt: null }),
      ])

      const result = await service.feed({ status: 'all', limit: 1, viewer: admin })

      expect(prisma.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
        }),
      )
      const decoded = JSON.parse(Buffer.from(result.nextCursor as string, 'base64url').toString())
      expect(decoded).toEqual({ o: 0, p: '2026-01-01T00:00:00.000Z', id: 9 })
    })
  })

  describe('categories', () => {
    it('maps tag ids to course counts and skips tags without courses', async () => {
      prisma.courseTag.groupBy.mockResolvedValueOnce([
        { tagId: 2, _count: { _all: 3 } },
        { tagId: 5, _count: { _all: 1 } },
      ])
      prisma.tag.findMany.mockResolvedValueOnce([{ id: 2, name: 'AI', slug: 'ai' }])

      const result = await service.categories()

      expect(result).toEqual([{ id: 2, name: 'AI', slug: 'ai', courseCount: 3 }])
    })

    it('skips the tag query when no course is published', async () => {
      prisma.courseTag.groupBy.mockResolvedValueOnce([])

      await expect(service.categories()).resolves.toEqual([])
      expect(prisma.tag.findMany).not.toHaveBeenCalled()
    })

    it('orders DEFAULT_TAGS first and the rest by name', async () => {
      prisma.courseTag.groupBy.mockResolvedValueOnce([
        { tagId: 1, _count: { _all: 1 } },
        { tagId: 2, _count: { _all: 1 } },
        { tagId: 3, _count: { _all: 1 } },
        { tagId: 4, _count: { _all: 1 } },
      ])
      prisma.tag.findMany.mockResolvedValueOnce([
        { id: 1, name: '人工智能', slug: 'ai' },
        { id: 2, name: 'Zig', slug: 'zig' },
        { id: 3, name: '前端', slug: 'frontend' },
        { id: 4, name: 'Alpine', slug: 'alpine' },
      ])

      const result = await service.categories()

      expect(result.map((category) => category.slug)).toEqual(['frontend', 'ai', 'alpine', 'zig'])
    })
  })

  describe('detail', () => {
    it('throws COURSE_NOT_FOUND for a missing course', async () => {
      prisma.course.findUnique.mockResolvedValueOnce(null)

      await expect(service.detail(99)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('hides drafts from anonymous viewers but exposes them to admins', async () => {
      prisma.course.findUnique.mockResolvedValueOnce(courseRow({ status: 'draft' }))
      await expect(service.detail(1)).rejects.toBeInstanceOf(NotFoundException)

      prisma.course.findUnique.mockResolvedValueOnce(courseRow({ status: 'draft' }))
      prisma.enrollment.count.mockResolvedValueOnce(0)
      const result = await service.detail(1, admin)
      expect(result.status).toBe('draft')
      expect(result.enrolledByMe).toBe(false)
    })

    it('reports enrolledByMe for an active enrollment', async () => {
      prisma.course.findUnique.mockResolvedValueOnce(courseRow())
      prisma.enrollment.count.mockResolvedValueOnce(1)

      const result = await service.detail(1, user)

      expect(result.enrolledByMe).toBe(true)
      expect(result.audience).toEqual(['前端转全栈', '零基础入门'])
    })
  })

  describe('create', () => {
    it('rejects non-admin users', async () => {
      await expect(service.create(user, baseDto)).rejects.toBeInstanceOf(ForbiddenException)
      expect(prisma.course.create).not.toHaveBeenCalled()
    })

    it('throws TEACHER_NOT_FOUND when the teacher does not exist', async () => {
      prisma.teacher.findUnique.mockResolvedValueOnce(null)

      await expect(service.create(admin, baseDto)).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.course.create).not.toHaveBeenCalled()
    })

    it('creates a published course with tags and a publish timestamp', async () => {
      prisma.teacher.findUnique.mockResolvedValueOnce({ id: 1 })
      prisma.tag.findMany.mockResolvedValueOnce([{ id: 2 }])
      prisma.course.create.mockResolvedValueOnce(courseRow())

      const result = await service.create(admin, {
        ...baseDto,
        status: 'published',
        badge: ' 新课 ',
      })

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'AI 时代再学 Java（漫画版）',
            badge: '新课',
            status: 'published',
            publishedAt: expect.any(Date),
            tags: { create: [{ tagId: 2 }] },
          }),
        }),
      )
      expect(result.enrolledByMe).toBe(false)
    })

    it('keeps drafts unpublished', async () => {
      prisma.teacher.findUnique.mockResolvedValueOnce({ id: 1 })
      prisma.tag.findMany.mockResolvedValueOnce([])
      prisma.course.create.mockResolvedValueOnce(courseRow({ status: 'draft', publishedAt: null }))

      await service.create(admin, { ...baseDto, audience: ['  前端转全栈  ', '   '] })

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'draft',
            publishedAt: null,
            audience: ['前端转全栈'],
          }),
        }),
      )
    })
  })

  describe('update', () => {
    it('stamps publishedAt on the draft to published transition', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'draft' })
      prisma.course.update.mockResolvedValueOnce(courseRow())
      prisma.enrollment.count.mockResolvedValueOnce(0)

      await service.update(admin, 1, { status: 'published' })

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
        }),
      )
    })

    it('clears publishedAt when unpublishing', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'published' })
      prisma.course.update.mockResolvedValueOnce(courseRow({ status: 'draft', publishedAt: null }))
      prisma.enrollment.count.mockResolvedValueOnce(0)

      await service.update(admin, 1, { status: 'draft' })

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'draft', publishedAt: null }),
        }),
      )
    })

    it('replaces tags only when tagIds is provided', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'published' })
      prisma.course.update.mockResolvedValueOnce(courseRow())
      prisma.enrollment.count.mockResolvedValueOnce(0)

      await service.update(admin, 1, { title: '新标题' })
      const data = prisma.course.update.mock.calls[0][0].data
      expect(data.tags).toBeUndefined()
      expect(data.title).toBe('新标题')
    })
  })

  describe('enrollment', () => {
    it('creates an enrolled record without any payment data', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'published' })
      prisma.enrollment.findUnique.mockResolvedValueOnce(null)
      prisma.enrollment.create.mockResolvedValueOnce({ id: 1 })
      prisma.enrollment.count.mockResolvedValueOnce(35)

      const result = await service.enroll(user, 1)

      expect(prisma.enrollment.create).toHaveBeenCalledWith({
        data: { userId: 2, courseId: 1, status: 'enrolled' },
      })
      expect(result).toEqual({ enrolled: true, enrollCount: 35 })
    })

    it('is idempotent for an already enrolled user', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'published' })
      prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 7, status: 'enrolled' })
      prisma.enrollment.count.mockResolvedValueOnce(35)

      const result = await service.enroll(user, 1)

      expect(prisma.enrollment.create).not.toHaveBeenCalled()
      expect(prisma.enrollment.update).not.toHaveBeenCalled()
      expect(result.enrolled).toBe(true)
    })

    it('reactivates a canceled enrollment instead of inserting a duplicate', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'published' })
      prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 7, status: 'canceled' })
      prisma.enrollment.count.mockResolvedValueOnce(1)

      await service.enroll(user, 1)

      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'enrolled' },
      })
      expect(prisma.enrollment.create).not.toHaveBeenCalled()
    })

    it('refuses to enroll in a missing or unpublished course', async () => {
      prisma.course.findUnique.mockResolvedValueOnce(null)
      await expect(service.enroll(user, 1)).rejects.toBeInstanceOf(NotFoundException)

      prisma.course.findUnique.mockResolvedValueOnce({ id: 1, status: 'draft' })
      await expect(service.enroll(user, 1)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('keeps the record but drops the count when canceling', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1 })
      prisma.enrollment.findUnique.mockResolvedValueOnce({ id: 7, status: 'enrolled' })
      prisma.enrollment.update.mockResolvedValueOnce({ id: 7 })
      prisma.enrollment.count.mockResolvedValueOnce(34)

      const result = await service.cancelEnrollment(user, 1)

      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'canceled' },
      })
      expect(prisma.enrollment.create).not.toHaveBeenCalled()
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled()
      expect(result).toEqual({ enrolled: false, enrollCount: 34 })
    })
  })

  describe('listEnrollments', () => {
    it('is admin only', async () => {
      await expect(service.listEnrollments(user, 1)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns the roster with user contact info', async () => {
      prisma.course.findUnique.mockResolvedValueOnce({ id: 1 })
      prisma.enrollment.findMany.mockResolvedValueOnce([
        {
          id: 1,
          status: 'enrolled',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          user: { id: 2, username: 'user', email: 'user@devshare.dev', avatar: null },
        },
      ])

      const result = await service.listEnrollments(admin, 1)

      expect(result).toEqual([
        {
          id: 1,
          status: 'enrolled',
          createdAt: '2026-02-01T00:00:00.000Z',
          user: { id: 2, username: 'user', email: 'user@devshare.dev', avatar: null },
        },
      ])
    })
  })
})
