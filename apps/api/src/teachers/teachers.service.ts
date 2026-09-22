import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ErrorCodes, type TeacherDTO } from '@devshare/shared'
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { CreateTeacherDto } from './dto/create-teacher.dto'
import { UpdateTeacherDto } from './dto/update-teacher.dto'

type TeacherWithCount = Prisma.TeacherGetPayload<{
  include: { _count: { select: { courses: true } } }
}>

function toDto(teacher: TeacherWithCount): TeacherDTO {
  return {
    id: teacher.id,
    name: teacher.name,
    avatar: teacher.avatar,
    bio: teacher.bio,
    courseCount: teacher._count.courses,
  }
}

const withCount = { _count: { select: { courses: true } } } satisfies Prisma.TeacherInclude

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<TeacherDTO[]> {
    const teachers = await this.prisma.teacher.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: withCount,
    })
    return teachers.map(toDto)
  }

  async create(user: AuthenticatedUser, dto: CreateTeacherDto): Promise<TeacherDTO> {
    this.assertAdmin(user)

    const teacher = await this.prisma.teacher.create({
      data: {
        name: dto.name.trim(),
        avatar: dto.avatar?.trim() || null,
        bio: dto.bio?.trim() || null,
      },
      include: withCount,
    })
    return toDto(teacher)
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateTeacherDto): Promise<TeacherDTO> {
    this.assertAdmin(user)

    const existing = await this.prisma.teacher.findUnique({ where: { id } })
    if (!existing) throw this.notFound()

    const teacher = await this.prisma.teacher.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar.trim() || null } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio.trim() || null } : {}),
      },
      include: withCount,
    })
    return toDto(teacher)
  }

  async remove(user: AuthenticatedUser, id: number): Promise<{ success: boolean }> {
    this.assertAdmin(user)

    const existing = await this.prisma.teacher.findUnique({ where: { id }, include: withCount })
    if (!existing) throw this.notFound()

    // 讲师被课程引用时不允许删除，避免课程被级联清掉
    if (existing._count.courses > 0) {
      throw new ConflictException({
        code: ErrorCodes.TEACHER_IN_USE,
        message: '该讲师名下还有课程，请先调整课程归属',
      })
    }

    await this.prisma.teacher.delete({ where: { id } })
    return { success: true }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.TEACHER_NOT_FOUND, message: '讲师不存在' })
  }

  private assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Only admins can manage teachers',
      })
    }
  }
}
