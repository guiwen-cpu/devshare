import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  DEFAULT_TAGS,
  ErrorCodes,
  type CourseCategoryDTO,
  type CourseDetail,
  type CourseDifficulty,
  type CourseListItem,
  type EnrollmentItem,
  type EnrollmentStatus,
  type EnrollmentResult,
  type Paginated,
} from '@devshare/shared'
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCourseDto } from './dto/create-course.dto'
import { UpdateCourseDto } from './dto/update-course.dto'
import { courseInclude, toCourseDetail, toCourseListItem } from './course.mapper'

// 与 articles 保持同一套 cursor 约定（base64url 编码的 JSON）
function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeCursor(cursor?: string): Record<string, unknown> | null {
  if (!cursor) return null
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString()) as Record<string, unknown>
  } catch {
    return null
  }
}

// 分类顺序跟站内导航保持一致：DEFAULT_TAGS 里有的按它的顺序，其余按名称
const TAG_ORDER = new Map<string, number>(
  DEFAULT_TAGS.map((tag, index): [string, number] => [tag.slug, index]),
)

function compareTagOrder(a: { name: string; slug: string }, b: { name: string; slug: string }) {
  const left = TAG_ORDER.get(a.slug)
  const right = TAG_ORDER.get(b.slug)
  if (left !== undefined && right !== undefined) return left - right
  if (left !== undefined) return -1
  if (right !== undefined) return 1
  return a.name.localeCompare(b.name, 'zh-Hans-CN')
}

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async feed(opts: {
    tag?: string
    status?: 'published' | 'draft' | 'all'
    difficulty?: CourseDifficulty
    q?: string
    cursor?: string
    limit?: number
    viewer?: AuthenticatedUser
  }): Promise<Paginated<CourseListItem>> {
    const limit = Math.min(opts.limit ?? 6, 24)
    // 只有管理员能看草稿，其他人无论传什么都只看已上架课程
    const status = opts.viewer?.role === 'admin' ? (opts.status ?? 'published') : 'published'

    const where: Prisma.CourseWhereInput = {}
    if (status !== 'all') where.status = status
    if (opts.difficulty) where.difficulty = opts.difficulty
    if (opts.tag) where.tags = { some: { tag: { slug: opts.tag } } }

    // 关键词沿用文章搜索那套语义：按空白拆词，每个词都要在「标题 / 简介 / 讲师名 / 标签名」里命中一个。
    // 关键词的 AND 与上面的 status/difficulty/tags、以及游标的 OR 是不同键，互不覆盖。
    const keywords = opts.q?.trim().split(/\s+/).filter(Boolean) ?? []
    if (keywords.length > 0) {
      where.AND = keywords.map((word) => ({
        OR: [
          { title: { contains: word, mode: 'insensitive' as const } },
          { summary: { contains: word, mode: 'insensitive' as const } },
          { teacher: { name: { contains: word, mode: 'insensitive' as const } } },
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
    }

    // 草稿的 publishedAt 可能为 null，按 null 参与排序比较不可靠，这条查询改用 id 做游标
    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      status === 'published'
        ? [{ sortOrder: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }]
        : [{ sortOrder: 'desc' }, { id: 'desc' }]

    const c = decodeCursor(opts.cursor)
    let cursorWhere: Prisma.CourseWhereInput | undefined
    if (c && typeof c.o === 'number' && typeof c.id === 'number') {
      if (status === 'published' && typeof c.p === 'string') {
        const at = new Date(c.p)
        cursorWhere = {
          OR: [
            { sortOrder: { lt: c.o } },
            { sortOrder: c.o, publishedAt: { lt: at } },
            { sortOrder: c.o, publishedAt: at, id: { lt: c.id } },
          ],
        }
      } else {
        cursorWhere = {
          OR: [{ sortOrder: { lt: c.o } }, { sortOrder: c.o, id: { lt: c.id } }],
        }
      }
    }

    const rows = await this.prisma.course.findMany({
      where: { ...where, ...(cursorWhere ?? {}) },
      orderBy,
      take: limit + 1,
      include: courseInclude,
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return {
      items: page.map(toCourseListItem),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              o: last.sortOrder,
              p: (last.publishedAt ?? last.createdAt).toISOString(),
              id: last.id,
            })
          : null,
    }
  }

  async categories(): Promise<CourseCategoryDTO[]> {
    const grouped = await this.prisma.courseTag.groupBy({
      by: ['tagId'],
      where: { course: { status: 'published' } },
      _count: { _all: true },
    })
    if (grouped.length === 0) return []

    const tags = await this.prisma.tag.findMany({
      where: { id: { in: grouped.map((g) => g.tagId) } },
      orderBy: { name: 'asc' },
    })
    const counts = new Map(grouped.map((g) => [g.tagId, g._count._all]))
    return tags.sort(compareTagOrder).map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      courseCount: counts.get(tag.id) ?? 0,
    }))
  }

  async detail(id: number, viewer?: AuthenticatedUser): Promise<CourseDetail> {
    const row = await this.prisma.course.findUnique({ where: { id }, include: courseInclude })
    if (!row || (row.status !== 'published' && viewer?.role !== 'admin')) throw this.notFound()

    const enrolledByMe = viewer ? await this.hasEnrollment(viewer.id, id) : false
    return toCourseDetail(row, enrolledByMe)
  }

  async create(user: AuthenticatedUser, dto: CreateCourseDto): Promise<CourseDetail> {
    this.assertAdmin(user)
    await this.assertTeacher(dto.teacherId)

    const status = dto.status ?? 'draft'
    const tagIds = await this.existingTagIds(dto.tagIds)
    const course = await this.prisma.course.create({
      data: {
        title: dto.title.trim(),
        cover: dto.cover?.trim() || null,
        summary: dto.summary?.trim() || null,
        audience: this.cleanAudience(dto.audience),
        difficulty: dto.difficulty,
        badge: dto.badge?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        teacherId: dto.teacherId,
        status,
        publishedAt: status === 'published' ? new Date() : null,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: courseInclude,
    })
    return toCourseDetail(course, false)
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseDto): Promise<CourseDetail> {
    this.assertAdmin(user)

    const existing = await this.prisma.course.findUnique({ where: { id } })
    if (!existing) throw this.notFound()
    if (dto.teacherId !== undefined) await this.assertTeacher(dto.teacherId)

    const wasPublished = existing.status === 'published'
    const willPublish = dto.status === 'published'
    const willUnpublish = dto.status === 'draft'
    const tagIds = dto.tagIds !== undefined ? await this.existingTagIds(dto.tagIds) : undefined

    const data: Prisma.CourseUncheckedUpdateInput = {}
    if (dto.title !== undefined) data.title = dto.title.trim()
    if (dto.cover !== undefined) data.cover = dto.cover?.trim() || null
    if (dto.summary !== undefined) data.summary = dto.summary?.trim() || null
    if (dto.audience !== undefined) data.audience = this.cleanAudience(dto.audience)
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty
    if (dto.badge !== undefined) data.badge = dto.badge?.trim() || null
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder
    if (dto.teacherId !== undefined) data.teacherId = dto.teacherId
    if (dto.status !== undefined) data.status = dto.status
    // 首次上架记录发布时间；下架清空，重新上架会拿到新的时间
    if (willPublish && !wasPublished) data.publishedAt = new Date()
    if (willUnpublish) data.publishedAt = null
    if (tagIds !== undefined) {
      data.tags = { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) }
    }

    const course = await this.prisma.course.update({
      where: { id },
      data,
      include: courseInclude,
    })

    const enrolledByMe = await this.hasEnrollment(user.id, id)
    return toCourseDetail(course, enrolledByMe)
  }

  async remove(user: AuthenticatedUser, id: number): Promise<{ success: boolean }> {
    this.assertAdmin(user)

    const existing = await this.prisma.course.findUnique({ where: { id } })
    if (!existing) throw this.notFound()

    await this.prisma.course.delete({ where: { id } })
    return { success: true }
  }

  /// 报名：全部课程公益免费，报名即写一条 enrolled 记录，不涉及支付与金额
  async enroll(user: AuthenticatedUser, id: number): Promise<EnrollmentResult> {
    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course || course.status !== 'published') throw this.notFound()

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: id } },
    })

    if (!existing) {
      await this.prisma.enrollment.create({
        data: { userId: user.id, courseId: id, status: 'enrolled' },
      })
    } else if (existing.status !== 'enrolled') {
      // 取消过再报名：复用同一条记录，避免唯一键冲突
      await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'enrolled' },
      })
    }

    return { enrolled: true, enrollCount: await this.countEnrollments(id) }
  }

  async cancelEnrollment(user: AuthenticatedUser, id: number): Promise<EnrollmentResult> {
    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course) throw this.notFound()

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: id } },
    })
    if (existing && existing.status === 'enrolled') {
      await this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: 'canceled' },
      })
    }

    return { enrolled: false, enrollCount: await this.countEnrollments(id) }
  }

  async listEnrollments(user: AuthenticatedUser, id: number): Promise<EnrollmentItem[]> {
    this.assertAdmin(user)

    const course = await this.prisma.course.findUnique({ where: { id } })
    if (!course) throw this.notFound()

    const rows = await this.prisma.enrollment.findMany({
      where: { courseId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, email: true, avatar: true } } },
    })
    return rows.map((row) => ({
      id: row.id,
      user: row.user,
      status: row.status as EnrollmentStatus,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  private cleanAudience(audience?: string[]): string[] {
    return (audience ?? []).map((item) => item.trim()).filter(Boolean)
  }

  private async existingTagIds(tagIds?: number[]): Promise<number[]> {
    if (!tagIds || tagIds.length === 0) return []
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds } },
      select: { id: true },
    })
    return tags.map((tag) => tag.id)
  }

  private async assertTeacher(teacherId: number): Promise<void> {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } })
    if (!teacher) {
      throw new NotFoundException({ code: ErrorCodes.TEACHER_NOT_FOUND, message: '讲师不存在' })
    }
  }

  private async hasEnrollment(userId: number, courseId: number): Promise<boolean> {
    const count = await this.prisma.enrollment.count({
      where: { userId, courseId, status: 'enrolled' },
    })
    return count > 0
  }

  private countEnrollments(courseId: number): Promise<number> {
    return this.prisma.enrollment.count({ where: { courseId, status: 'enrolled' } })
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.COURSE_NOT_FOUND, message: '课程不存在' })
  }

  private assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Only admins can manage courses',
      })
    }
  }
}
