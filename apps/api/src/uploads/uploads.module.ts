// ============================================================================
// uploads.module.ts —— 上传模块（Module）
//
// NestJS 用「模块」把一组相关代码打包在一起：
//   controllers —— 对外暴露的接口
//   providers   —— 可被依赖注入的服务
//   imports     —— 本模块需要用到的其他模块
// 别的模块只有 import 了本模块，才能用到这里导出的东西。
// ============================================================================
import { Module } from '@nestjs/common'
// ServeStaticModule 用来把本地目录当作静态资源服务器，让上传后的图片能直接用 URL 访问
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'node:path'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'

@Module({
  imports: [
    // 把本地磁盘目录挂成静态资源：
    //   磁盘目录 = <项目运行目录>/uploads   （可用环境变量 UPLOAD_DIR 覆盖）
    //   访问前缀 = /uploads
    // 于是 Service 把文件写进 uploads/2026/09/abc.png 之后，
    // 浏览器就能通过 http://主机/uploads/2026/09/abc.png 直接看到这张图。
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'),
      serveRoot: '/uploads',
    }),
  ],
  controllers: [UploadsController], // 注册控制器，里面的路由才会生效
  providers: [UploadsService], // 注册服务，它才能被构造函数注入到别处使用
})
export class UploadsModule {}
