import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard'
import { ArticlesService } from './articles.service'
import { CreateArticleDto } from './dto/create-article.dto'
import { UpdateArticleDto } from './dto/update-article.dto'
import { QueryArticlesDto } from './dto/query-articles.dto'

@ApiTags('articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '文章流（支持 latest/hot、标签过滤、cursor 分页）' })
  async feed(@Query() query: QueryArticlesDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.articles.feed({
      sort: query.sort,
      tag: query.tag,
      cursor: query.cursor,
      limit: query.limit,
      viewerId: viewer?.id,
    })
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '文章详情（SSR 使用，浏览计数 +1）' })
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.articles.detail(id, viewer)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建文章（可草稿或直接发布）' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateArticleDto) {
    return this.articles.create(user, dto)
  }

  // 必须用 PUT：线上主站走阿里云 CDN，CDN 不支持 PATCH（边缘直接 400，见 PITFALLS 第 18 条）
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新文章（仅作者/admin）' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articles.update(user, id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除文章（仅作者/admin）' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.articles.remove(user, id)
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '点赞/取消点赞（toggle）' })
  async like(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.articles.toggleLike(user.id, id)
  }

  @Post(':id/collect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '收藏/取消收藏（toggle）' })
  async collect(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.articles.toggleCollect(user.id, id)
  }
}
