import { Module } from '@nestjs/common'
import { BannersController } from './banners.controller'
import { BannersService } from './banners.service'

/// Banner 是单表无关联，读写都落在一个 service 里，不需要 mapper 或额外 provider
@Module({
  controllers: [BannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
