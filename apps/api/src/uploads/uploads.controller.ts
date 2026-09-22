// ============================================================================
// uploads.controller.ts —— 上传模块的「控制器」（Controller）
//
// NestJS 处理一次请求的链路大致是：
//   浏览器 → Controller（收请求、取参数）→ Service（干实际的活）→ 返回结果
// Controller 的职责很单一：把 HTTP 请求翻译成一次方法调用，不写业务逻辑。
// ============================================================================

// 下面这些都是从 @nestjs/common 引入的装饰器 / 工具函数（装饰器就是 @ 开头的写法）
import {
  Controller, // 声明这是一个控制器（负责路由）
  Post, // 声明下面的方法处理 POST 请求
  UploadedFile, // 从请求中取出「上传的文件对象」注入到方法参数
  UseGuards, // 挂「守卫」：请求进入方法之前先做检查（这里用来校验登录）
  UseInterceptors, // 挂「拦截器」：在请求前后插入处理逻辑（这里用来解析上传表单）
} from '@nestjs/common'
// FileInterceptor 由 @nestjs/platform-express 提供，底层用的是 multer 这个上传中间件
import { FileInterceptor } from '@nestjs/platform-express'
// Swagger 相关装饰器：只影响自动生成的接口文档页面，不影响代码运行逻辑
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard' // 校验请求头里的 JWT 令牌
import { UploadsService } from './uploads.service' // 真正负责保存文件的 Service

@ApiTags('uploads') // Swagger 文档里把这些接口归到 "uploads" 分组下
@Controller('uploads') // 路由前缀：本控制器所有接口都以 /uploads 开头
@UseGuards(JwtAuthGuard) // 守卫：没带合法 token 的请求直接返回 401，进不到方法体里
@ApiBearerAuth() // 在 Swagger 文档上标注「调用需要携带 Bearer Token」
export class UploadsController {
  // 构造函数注入（依赖注入 / DI）：
  // 我们不用自己 new UploadsService()，Nest 会在启动时创建好实例并自动传进来。
  // 这是 NestJS 最核心的思想之一，体现了「控制反转」。
  constructor(private readonly uploads: UploadsService) {}

  // 对应路由：POST /uploads
  @Post()
  // 拦截器负责把 multipart/form-data 表单里的 file 字段解析成文件对象。
  // limits.fileSize 先限制最大 5MB（这里拦一道，Service 里还会再校验一次上限）。
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data') // 告诉 Swagger：本接口接收的是表单文件
  @ApiOperation({ summary: '上传图片（头像/封面），返回可访问 URL' })
  // @UploadedFile() 把上面解析出来的文件对象注入到参数 file。
  // Express.Multer.File 是 multer 定义的类型，常用字段：
  //   originalname 原始文件名 | mimetype 文件类型 | size 字节大小 | buffer 文件内容
  async upload(@UploadedFile() file: Express.Multer.File) {
    // 控制器不做业务判断，直接交给 Service 处理，保持职责单一
    return this.uploads.saveImage(file)
  }
}
