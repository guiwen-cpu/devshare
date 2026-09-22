import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { TeachersService } from './teachers.service'

describe('TeachersService', () => {
  let service: TeachersService
  const prisma = {
    teacher: {
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
      providers: [TeachersService, { provide: PrismaService, useValue: prisma }],
    }).compile()
    service = moduleRef.get(TeachersService)
  })

  const admin = { id: 1, email: 'admin@devshare.dev', username: 'admin', role: 'admin' }
  const user = { id: 2, email: 'user@devshare.dev', username: 'user', role: 'user' }

  it('lists teachers with their course counts', async () => {
    prisma.teacher.findMany.mockResolvedValueOnce([
      { id: 1, name: '李老师', avatar: null, bio: '十年后端', _count: { courses: 2 } },
    ])

    const result = await service.list()

    expect(result).toEqual([
      { id: 1, name: '李老师', avatar: null, bio: '十年后端', courseCount: 2 },
    ])
  })

  it('rejects non-admin users on create', async () => {
    await expect(service.create(user, { name: '李老师' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(prisma.teacher.create).not.toHaveBeenCalled()
  })

  it('trims input and stores empty optional fields as null', async () => {
    prisma.teacher.create.mockResolvedValueOnce({
      id: 3,
      name: '李老师',
      avatar: null,
      bio: null,
      _count: { courses: 0 },
    })

    await service.create(admin, { name: '  李老师  ', avatar: '   ', bio: '' })

    expect(prisma.teacher.create).toHaveBeenCalledWith({
      data: { name: '李老师', avatar: null, bio: null },
      include: { _count: { select: { courses: true } } },
    })
  })

  it('throws NotFoundException when updating a missing teacher', async () => {
    prisma.teacher.findUnique.mockResolvedValueOnce(null)

    await expect(service.update(admin, 99, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses to delete a teacher that still owns courses', async () => {
    prisma.teacher.findUnique.mockResolvedValueOnce({
      id: 1,
      name: '李老师',
      avatar: null,
      bio: null,
      _count: { courses: 2 },
    })

    await expect(service.remove(admin, 1)).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.teacher.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused teacher', async () => {
    prisma.teacher.findUnique.mockResolvedValueOnce({
      id: 1,
      name: '李老师',
      avatar: null,
      bio: null,
      _count: { courses: 0 },
    })
    prisma.teacher.delete.mockResolvedValueOnce({ id: 1 })

    await expect(service.remove(admin, 1)).resolves.toEqual({ success: true })
    expect(prisma.teacher.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})
