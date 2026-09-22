import { ApiPropertyOptional } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

/// 查询串里的 all 是字符串（'true' / '1'），先转成布尔再交给 service 判断要不要带上停用项
export class QueryBannersDto {
  @ApiPropertyOptional({
    default: false,
    description: '仅管理员有效，带上可返回停用项，普通用户会被忽略',
  })
  @IsOptional()
  // 字符串 'false' 也是 truthy，所以显式列举真值，而不是直接 Boolean(value)
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  all?: boolean = false
}
