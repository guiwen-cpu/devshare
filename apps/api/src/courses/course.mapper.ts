import { Prisma } from '@prisma/client'
import type { CourseDetail, CourseListItem } from '@devshare/shared'

export const courseTeacherSelect = {
  id: true,
  name: true,
  avatar: true,
  bio: true,
} as const

/// 报名人数用过滤计数实时算，不设冗余列，取消报名后人数自然回落
export const courseInclude = {
  teacher: { select: courseTeacherSelect },
  tags: { include: { tag: true } },
  _count: { select: { enrollments: { where: { status: 'enrolled' } } } },
} satisfies Prisma.CourseInclude

export type CourseWithRelations = Prisma.CourseGetPayload<{ include: typeof courseInclude }>

export function toCourseListItem(row: CourseWithRelations): CourseListItem {
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    summary: row.summary,
    teacher: row.teacher,
    tags: row.tags.map((t) => t.tag),
    difficulty: row.difficulty as CourseListItem['difficulty'],
    enrollCount: row._count.enrollments,
    badge: row.badge,
    status: row.status as CourseListItem['status'],
    sortOrder: row.sortOrder,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
  }
}

export function toCourseDetail(row: CourseWithRelations, enrolledByMe: boolean): CourseDetail {
  return {
    ...toCourseListItem(row),
    audience: row.audience,
    enrolledByMe,
    updatedAt: row.updatedAt.toISOString(),
  }
}
