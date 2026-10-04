// ============================================================================
// uploads.module.ts —— 上传模块（Module）
//
// NestJS 用「模块」把一组相关代码打包在一起：
//   controllers —— 对外暴露的接口
//   providers   —— 可被依赖注入的服务
//   imports     —— 本模块需要用到的其他模块
// 别的模块只有 import 了本模块，才能用到这里导出的东西。
//
// 注意：这里不再挂 ServeStaticModule —— 图片与视频都直传 OSS，
// 服务端不再落盘，也就没有本地目录要对外托管。
// ============================================================================
import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'

@Module({
  controllers: [UploadsController], // 注册控制器，里面的路由才会生效
  providers: [UploadsService], // 注册服务，它才能被构造函数注入到别处使用
})
export class UploadsModule {}
