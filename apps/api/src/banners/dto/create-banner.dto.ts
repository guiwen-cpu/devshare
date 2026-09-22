import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { BANNER_LINK_MAX, BANNER_SUBTITLE_MAX, BANNER_TITLE_MAX } from '@devshare/shared'

/// 长度上限从 shared 取，和前端表单校验共用同一套数字，避免两边各写一份
export class CreateBannerDto {
  @ApiProperty({ example: '从 0 到 1 搭一套自己的 AI 应用' })
  @IsString()
  @MinLength(1)
  @MaxLength(BANNER_TITLE_MAX)
  title: string

  @ApiPropertyOptional({ example: '一周上手 RAG 与 Agent' })
  @IsOptional()
  @IsString()
  @MaxLength(BANNER_SUBTITLE_MAX)
  subtitle?: string

  @ApiProperty({ example: 'https://cdn.example.com/banner.png', description: '建议 1600×600' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  image: string

  /// 只校验「非空 + 长度」，具体格式（站内路径 / http(s) 外链）由 service 的 normalizeLink 判定
  @ApiProperty({ example: '/courses/1', description: '站内路径（/ 开头）或 http(s) 外链' })
  @IsString()
  @MinLength(1)
  @MaxLength(BANNER_LINK_MAX)
  link: string

  @ApiPropertyOptional({ default: true, description: '停用后不在首页展示' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ default: 0, description: '排序值，越大越靠前' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number
}
