// ============================================================================
// uploads.controller.ts —— 上传模块的「控制器」（Controller）
//
// NestJS 处理一次请求的链路大致是：
//   浏览器 → Controller（收请求、取参数）→ Service（干实际的活）→ 返回结果
// Controller 的职责很单一：把 HTTP 请求翻译成一次方法调用，不写业务逻辑。
//
// 这里已经没有「收文件」的接口了：图片与视频都由浏览器直传 OSS，
// 服务端只负责签发临时凭证（sts）和下发配置（config）。
// ============================================================================
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard' // 校验请求头里的 JWT 令牌
import { UploadsService } from './uploads.service' // 真正负责签发凭证的 Service
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator'
import { UploadStsDto } from './dto/upload-sts.dto'

@ApiTags('uploads') // Swagger 文档里把这些接口归到 uploads 分组下
@Controller('uploads') // 路由前缀：本控制器所有接口都以 /uploads 开头
@UseGuards(JwtAuthGuard) // 守卫：没带合法 token 的请求直接返回 401，进不到方法体里
@ApiBearerAuth() // 在 Swagger 文档上标注「调用需要携带 Bearer Token」
export class UploadsController {
  // 构造函数注入（依赖注入 / DI）：不用自己 new，Nest 会创建好实例并自动传进来
  constructor(private readonly uploads: UploadsService) {}

  // 对应路由：GET /uploads/image/config
  @Get('image/config')
  @ApiOperation({ summary: '图片上传配置（登录即可）：是否启用、体积与格式上限' })
  imageConfig() {
    return this.uploads.imageConfig()
  }

  // 对应路由：POST /uploads/image/sts
  @Post('image/sts')
  @ApiOperation({ summary: '签发图片直传 OSS 的 STS 临时凭证（登录即可）' })
  imageSts(@Body() dto: UploadStsDto) {
    return this.uploads.createImageUploadSts(dto.mimetype, dto.key)
  }

  // 对应路由：GET /uploads/video/config
  @Get('video/config')
  @ApiOperation({ summary: '视频上传配置（仅管理员）：是否启用、体积与格式上限' })
  videoConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.uploads.videoConfig(user)
  }

  // 对应路由：POST /uploads/video/sts
  @Post('video/sts')
  @ApiOperation({ summary: '签发视频直传 OSS 的 STS 临时凭证（仅管理员）' })
  videoSts(@CurrentUser() user: AuthenticatedUser, @Body() dto: UploadStsDto) {
    return this.uploads.createVideoUploadSts(user, dto.mimetype, dto.key)
  }
}
