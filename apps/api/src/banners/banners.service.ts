import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Banner } from '@prisma/client'
import { ErrorCodes, type BannerDTO } from '@devshare/shared'
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { CreateBannerDto } from './dto/create-banner.dto'
import { UpdateBannerDto } from './dto/update-banner.dto'

/// Prisma 的 Date 直接进 JSON 会变成依赖运行时格式的字符串，统一转成 ISO，和 BannerDTO 对齐
function toDto(banner: Banner): BannerDTO {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle,
    image: banner.image,
    link: banner.link,
    enabled: banner.enabled,
    sortOrder: banner.sortOrder,
    createdAt: banner.createdAt.toISOString(),
    updatedAt: banner.updatedAt.toISOString(),
  }
}

/// 只放行站内路径（/ 开头）与 http(s) 外链，挡住 article/1、ftp://x 这类会静默跳错的值
function normalizeLink(raw: string): string {
  const link = raw.trim()
  if (link.startsWith('/') || /^https?:\/\//i.test(link)) return link
  throw new BadRequestException({
    code: ErrorCodes.VALIDATION_FAILED,
    message: 'link must start with "/" or be an http(s) URL',
  })
}

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  /// 首页读启用项、后台读全部：all 只在管理员身份下生效，其他情况静默降级
  async list(viewer?: AuthenticatedUser, all = false): Promise<BannerDTO[]> {
    const includeDisabled = all && viewer?.role === 'admin'
    const banners = await this.prisma.banner.findMany({
      // 停用项不该被首页读到，所以默认条件写死 enabled，只有管理员能把 where 放开
      where: includeDisabled ? undefined : { enabled: true },
      // 排序值相同时用 id 兜底，保证同一批数据每次读出来的顺序都一致
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    })
    return banners.map(toDto)
  }

  /// 新建：管理员专属，link 的格式在这里兜底校验（DTO 只管长度）
  async create(user: AuthenticatedUser, dto: CreateBannerDto): Promise<BannerDTO> {
    this.assertAdmin(user)

    const banner = await this.prisma.banner.create({
      data: {
        // 后台表单粘进来的值常带前后空格，存库前统一 trim
        title: dto.title.trim(),
        // 副标题选填，空串按「没填」处理，前端只需要判断 null
        subtitle: dto.subtitle?.trim() || null,
        image: dto.image.trim(),
        link: normalizeLink(dto.link),
        // 表默认值只在绕过 DTO 直连数据库时生效，这里显式补上，语义也写得更清楚
        enabled: dto.enabled ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    })
    return toDto(banner)
  }

  /// 更新：局部更新，只有提交上来的字段会被写库
  async update(user: AuthenticatedUser, id: number, dto: UpdateBannerDto): Promise<BannerDTO> {
    this.assertAdmin(user)

    // 先查一次，让「改不存在的 banner」返回 404 BANNER_NOT_FOUND，而不是 Prisma 的 P2025
    const existing = await this.prisma.banner.findUnique({ where: { id } })
    if (!existing) throw this.notFound()

    const banner = await this.prisma.banner.update({
      where: { id },
      data: {
        // 局部更新：只写传了的字段，避免未提交的字段被 undefined 覆盖
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        // 与 create 保持一致，空串等于清空副标题
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle.trim() || null } : {}),
        ...(dto.image !== undefined ? { image: dto.image.trim() } : {}),
        ...(dto.link !== undefined ? { link: normalizeLink(dto.link) } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    })
    return toDto(banner)
  }

  /// 硬删除：banner 是单表无关联，没有课程报名记录那样的级联负担
  async remove(user: AuthenticatedUser, id: number): Promise<{ success: boolean }> {
    this.assertAdmin(user)

    // 同 update：先确认存在，删除不存在的 id 才有明确的 404 语义
    const existing = await this.prisma.banner.findUnique({ where: { id } })
    if (!existing) throw this.notFound()

    await this.prisma.banner.delete({ where: { id } })
    return { success: true }
  }

  /// 控制器只挂了 JwtAuthGuard（保证是登录用户），「是不是管理员」这层判定集中放在这里
  private assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Only admins can manage banners',
      })
    }
  }

  /// Banner 只有「存在 / 不存在」两种失败，统一成一个工厂方法，避免错误码写散
  private notFound(): NotFoundException {
    return new NotFoundException({ code: ErrorCodes.BANNER_NOT_FOUND, message: 'Banner not found' })
  }
}
