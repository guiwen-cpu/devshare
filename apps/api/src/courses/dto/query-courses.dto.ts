import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class QueryCoursesDto {
  @ApiPropertyOptional({ description: 'cursor 分页游标' })
  @IsOptional()
  @IsString()
  cursor?: string

  @ApiPropertyOptional({ default: 6, description: '每页数量，首页课程区默认 6' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number = 6

  @ApiPropertyOptional({ example: 'ai', description: '课程分类（标签 slug）' })
  @IsOptional()
  @IsString()
  tag?: string

  @ApiPropertyOptional({
    enum: ['published', 'draft', 'all'],
    default: 'published',
    description: '非 published 仅管理员有效，普通用户会被强制回退为 published',
  })
  @IsOptional()
  @IsEnum(['published', 'draft', 'all'])
  status?: 'published' | 'draft' | 'all' = 'published'
}
