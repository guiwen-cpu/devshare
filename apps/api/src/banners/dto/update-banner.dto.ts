import { PartialType } from '@nestjs/swagger'
import { CreateBannerDto } from './create-banner.dto'

/// 更新允许只提交部分字段，所以直接由 CreateBannerDto 派生；改 create 的校验规则时 update 自动跟上
export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
