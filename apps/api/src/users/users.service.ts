import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ErrorCodes,
  type ArticleListItem,
  type Paginated,
  type UserProfile,
} from '@devshare/shared'
import type { CourseListItem } from '@devshare/shared'
import { PrismaService } from '../prisma/prisma.service'
import { toUserProfile } from './user.mapper'
import { UpdateProfileDto } from './dto/update-profile.dto'
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { courseInclude, toCourseListItem } from '../courses/course.mapper'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(id: number, viewerId?: number): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id } })
    if (!user)
      throw new NotFoundException({ code: ErrorCodes.USER_NOT_FOUND, message: '用户不存在' })

    const [articleCount, followerCount, followingCount, followedByMe] = await Promise.all([
      this.prisma.article.count({ where: { authorId: id, status: 'published' } }),
      this.prisma.follow.count({ where: { followeeId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
      viewerId
        ? this.prisma.follow.count({ where: { followerId: viewerId, followeeId: id } })
        : Promise.resolve(0),
    ])

    const profile = await toUserProfile(user)
    return {
      ...profile,
      email: viewerId === id ? user.email : undefined,
      articleCount,
      followerCount,
      followingCount,
      followedByMe: followedByMe > 0,
    }
  }

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<UserProfile> {
    if (dto.username) {
      const conflict = await this.prisma.user.findFirst({
        where: { username: dto.username, NOT: { id: userId } },
      })
      if (conflict)
        throw new ConflictException({
          code: ErrorCodes.USERNAME_TAKEN,
          message: '该用户名已被占用',
        })
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: dto.username,
        bio: dto.bio,
        avatar: dto.avatar,
        locale: dto.locale,
      },
    })
    return toUserProfile(user)
  }

  async toggleFollow(viewer: AuthenticatedUser, targetId: number): Promise<{ followed: boolean }> {
    if (viewer.id === targetId)
      throw new BadRequestException({ code: ErrorCodes.FORBIDDEN, message: '不能关注自己' })
    const target = await this.prisma.user.findUnique({ where: { id: targetId } })
    if (!target)
      throw new NotFoundException({ code: ErrorCodes.USER_NOT_FOUND, message: '用户不存在' })

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewer.id, followeeId: targetId } },
    })
    if (existing) {
      await this.prisma.follow.delete({
        where: { followerId_followeeId: { followerId: viewer.id, followeeId: targetId } },
      })
      return { followed: false }
    }
    await this.prisma.follow.create({ data: { followerId: viewer.id, followeeId: targetId } })
    return { followed: true }
  }

  async unfollow(viewer: AuthenticatedUser, targetId: number): Promise<{ followed: boolean }> {
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewer.id, followeeId: targetId } },
    })
    if (!existing) return { followed: false }
    await this.prisma.follow.delete({
      where: { followerId_followeeId: { followerId: viewer.id, followeeId: targetId } },
    })
    return { followed: false }
  }

  async getUserArticles(
    id: number,
    cursor?: string,
    limit = 20,
  ): Promise<Paginated<ArticleListItem>> {
    const cursorId = cursor && /^\d+$/.test(cursor) ? Number(cursor) : undefined
    const rows = await this.prisma.article.findMany({
      where: { authorId: id, status: 'published' },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: articleInclude,
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return {
      items: page.map((r) => toArticleListItem(r)),
      nextCursor: hasMore && last ? String(last.id) : null,
    }
  }

  async getUserCollects(
    userId: number,
    viewerId: number | undefined,
  ): Promise<Paginated<ArticleListItem>> {
    if (viewerId !== userId)
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: '无权查看' })
    const collects = await this.prisma.collect.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { articleId: true },
    })
    if (collects.length === 0) return { items: [], nextCursor: null }
    const rows = await this.prisma.article.findMany({
      where: { id: { in: collects.map((c) => c.articleId) }, status: 'published' },
      include: articleInclude,
    })
    const map = new Map(rows.map((r) => [r.id, r]))
    return {
      items: collects
        .map((c) => map.get(c.articleId))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => toArticleListItem(r)),
      nextCursor: null,
    }
  }
  /// 我报名的课程，仅本人可见；只统计仍在 enrolled 状态的报名
  async getUserCourses(
    userId: number,
    viewerId: number | undefined,
    cursor?: string,
    limit = 20,
  ): Promise<Paginated<CourseListItem>> {
    if (viewerId !== userId)
      throw new ForbiddenException({ code: ErrorCodes.FORBIDDEN, message: '无权查看' })

    const cursorId = cursor && /^\d+$/.test(cursor) ? Number(cursor) : undefined
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: 'enrolled' },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: { course: { include: courseInclude } },
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    return {
      items: page.map((row) => toCourseListItem(row.course)),
      nextCursor: hasMore && last ? String(last.id) : null,
    }
  }
}

const articleInclude = {
  author: { select: { id: true, username: true, avatar: true, bio: true } },
  tags: { include: { tag: true } },
} as const

function toArticleListItem(r: {
  id: number
  title: string
  summary: string | null
  cover: string | null
  viewCount: number
  likeCount: number
  collectCount: number
  commentCount: number
  status: string
  publishedAt: Date | null
  createdAt: Date
  author: { id: number; username: string; avatar: string | null; bio: string | null }
  tags: { tag: { id: number; name: string; slug: string } }[]
}): ArticleListItem {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    cover: r.cover,
    author: r.author,
    tags: r.tags.map((t) => t.tag),
    viewCount: r.viewCount,
    likeCount: r.likeCount,
    collectCount: r.collectCount,
    commentCount: r.commentCount,
    status: r.status as ArticleListItem['status'],
    publishedAt: r.publishedAt?.toISOString() ?? r.createdAt.toISOString(),
  }
}
