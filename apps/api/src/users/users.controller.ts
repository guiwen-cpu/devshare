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
import { CursorPageDto } from '../common/dto/cursor-page.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { UsersService } from './users.service'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取用户主页信息（含统计与关注状态）' })
  async profile(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.users.getProfile(id, viewer?.id)
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户资料' })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto)
  }

  @Get(':id/articles')
  @ApiOperation({ summary: '用户发布的文章（cursor 分页）' })
  async articles(@Param('id', ParseIntPipe) id: number, @Query() query: CursorPageDto) {
    return this.users.getUserArticles(id, query.cursor, query.limit)
  }

  @Get(':id/collects')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '用户收藏的文章（仅本人可见）' })
  async collects(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.users.getUserCollects(id, viewer?.id)
  }

  @Get(':id/courses')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '用户报名的课程（仅本人可见）' })
  async courses(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CursorPageDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.getUserCourses(id, viewer?.id, query.cursor, query.limit)
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '关注/取消关注（toggle）' })
  async follow(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.users.toggleFollow(user, id)
  }

  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消关注' })
  async unfollow(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.users.unfollow(user, id)
  }
}
