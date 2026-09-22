import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { TeachersService } from './teachers.service'
import { CreateTeacherDto } from './dto/create-teacher.dto'
import { UpdateTeacherDto } from './dto/update-teacher.dto'

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ApiOperation({ summary: '讲师列表（含课程数）' })
  list() {
    return this.teachers.list()
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建讲师（仅管理员）' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTeacherDto) {
    return this.teachers.create(user, dto)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新讲师（仅管理员）' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.teachers.update(user, id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除讲师（仅管理员，名下仍有课程时返回 409）' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.teachers.remove(user, id)
  }
}
