import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import {
  COURSE_DIFFICULTIES,
  COURSE_STATUSES,
  type CourseDifficulty,
  type CourseStatus,
} from '@devshare/shared'

export class CreateCourseDto {
  @ApiProperty({ example: 'AI 时代再学 Java（漫画版）' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cover.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cover?: string

  @ApiPropertyOptional({ description: '课程简介' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string

  @ApiPropertyOptional({ type: [String], description: '适合人群（多条）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  audience?: string[]

  @ApiProperty({ enum: COURSE_DIFFICULTIES, example: 'beginner' })
  @IsIn(COURSE_DIFFICULTIES)
  difficulty: CourseDifficulty

  @ApiPropertyOptional({ example: '新课' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  badge?: string

  @ApiPropertyOptional({ enum: COURSE_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(COURSE_STATUSES)
  status?: CourseStatus

  @ApiPropertyOptional({ example: 0, description: '排序值，越大越靠前' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  teacherId: number

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2],
    description: '课程分类，复用文章标签表',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  tagIds?: number[]
}
