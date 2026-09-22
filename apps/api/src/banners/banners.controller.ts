import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard'
import { BannersService } from './banners.service'
import { CreateBannerDto } from './dto/create-banner.dto'
import { UpdateBannerDto } from './dto/update-banner.dto'
import { QueryBannersDto } from './dto/query-banners.dto'

/// Banner 只服务首页顶部轮播：读接口对匿名开放（没配就是空数组），写接口一律仅管理员
@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  // 匿名也要能读到首页 banner，所以用 OptionalJwtAuthGuard：只有带上管理员令牌时 all=true 才生效
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '首页 Banner 列表（默认仅启用项，管理员可用 all=true 查停用项）' })
  async list(@Query() query: QueryBannersDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.banners.list(viewer, query.all)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 Banner（仅管理员）' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBannerDto) {
    return this.banners.create(user, dto)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新 Banner（仅管理员）' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.banners.update(user, id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除 Banner（仅管理员）' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.banners.remove(user, id)
  }
}
