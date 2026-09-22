import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateTeacherDto {
  @ApiProperty({ example: '李老师' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string

  @ApiPropertyOptional({ example: '十年后端经验，专注 JVM 与分布式系统' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string
}
