import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UploadStsDto {
  // 只做「是字符串」这一层校验，白名单判断交给 Service：
  // 这样前端拿到的是 UNSUPPORTED_FILE_TYPE（有对应文案），而不是笼统的 VALIDATION_FAILED。
  @ApiProperty({ example: 'image/png', description: '待上传文件的 MIME 类型' })
  @IsString()
  @MaxLength(100)
  mimetype: string

  // 临时凭证续签时带上第一次签发的对象名，会话策略继续钉在同一个 key 上；
  // 首次签发不传，由服务端生成。合法性由 Service 校验。
  @ApiPropertyOptional({ description: '续签时复用首次签发的对象名' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  key?: string
}
