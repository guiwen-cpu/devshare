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
import { CoursesService } from './courses.service'
import { CreateCourseDto } from './dto/create-course.dto'
import { UpdateCourseDto } from './dto/update-course.dto'
import { QueryCoursesDto } from './dto/query-courses.dto'

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程列表（默认仅 published，管理员可用 status=all 查草稿）' })
  async feed(@Query() query: QueryCoursesDto, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.courses.feed({
      tag: query.tag,
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
      viewer,
    })
  }

  @Get('categories')
  @ApiOperation({ summary: '课程分类（复用标签，仅返回含已上架课程的标签）' })
  categories() {
    return this.courses.categories()
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '课程详情（草稿仅管理员可见）' })
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() viewer?: AuthenticatedUser) {
    return this.courses.detail(id, viewer)
  }

  @Get(':id/enrollments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '课程报名名单（仅管理员）' })
  async enrollments(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.courses.listEnrollments(user, id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建课程（仅管理员）' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCourseDto) {
    return this.courses.create(user, dto)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新课程（仅管理员）' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(user, id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除课程（仅管理员）' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.courses.remove(user, id)
  }

  @Post(':id/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '报名课程（公益免费，幂等）' })
  async enroll(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.courses.enroll(user, id)
  }

  @Delete(':id/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消报名（保留记录，置为 canceled）' })
  async cancelEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.courses.cancelEnrollment(user, id)
  }
}
