import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ArticlesModule } from './articles/articles.module'
import { CommentsModule } from './comments/comments.module'
import { TagsModule } from './tags/tags.module'
import { SearchModule } from './search/search.module'
import { UploadsModule } from './uploads/uploads.module'
import { RankModule } from './rank/rank.module'
import { CoursesModule } from './courses/courses.module'
import { TeachersModule } from './teachers/teachers.module'
import { BannersModule } from './banners/banners.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ArticlesModule,
    CommentsModule,
    TagsModule,
    SearchModule,
    UploadsModule,
    RankModule,
    CoursesModule,
    TeachersModule,
    BannersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
