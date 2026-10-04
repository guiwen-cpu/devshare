export const BRAND = {
  name: 'DevShare（技享）',
  sloganZh: '开发者技术分享社区',
  sloganEn: 'Developer Tech Sharing Community',
  primary: '#2F6BFF',
  accent: '#00C2A8',
  bg: '#F7F8FA',
  text: '#0F172A',
} as const

export type Locale = 'zh' | 'en'
export const LOCALES: Locale[] = ['zh', 'en']

export type Role = 'user' | 'admin'
export type ArticleStatus = 'draft' | 'published'
export type SortOrder = 'latest' | 'hot'

export type CourseDifficulty = 'beginner' | 'elementary' | 'intermediate' | 'advanced'
export type CourseStatus = 'draft' | 'published'
export type EnrollmentStatus = 'enrolled' | 'canceled'

export const COURSE_DIFFICULTIES: CourseDifficulty[] = [
  'beginner',
  'elementary',
  'intermediate',
  'advanced',
]

export const COURSE_STATUSES: CourseStatus[] = ['draft', 'published']

/// 首页 Banner 的字段上限，前后端共用一套，避免表单与 DTO 各写一份
export const BANNER_TITLE_MAX = 40
export const BANNER_SUBTITLE_MAX = 80
export const BANNER_LINK_MAX = 500

/// 难度枚举的中英文案，前端用 locale 取对应字段，避免在组件里重复映射
export const DIFFICULTY_LABELS: Record<CourseDifficulty, { zh: string; en: string }> = {
  beginner: { zh: '入门', en: 'Beginner' },
  elementary: { zh: '初级', en: 'Elementary' },
  intermediate: { zh: '中级', en: 'Intermediate' },
  advanced: { zh: '高级', en: 'Advanced' },
}

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
  total?: number
}

export interface ApiResponse<T> {
  data: T
}

export interface ApiErrorBody {
  statusCode: number
  code: string
  message: string
  details?: unknown
}

export interface AuthorInfo {
  id: number
  username: string
  avatar: string | null
  bio: string | null
}

export interface TagDTO {
  id: number
  name: string
  slug: string
  articleCount?: number
}

export interface UserProfile {
  id: number
  username: string
  email?: string
  avatar: string | null
  bio: string | null
  role: Role
  locale: Locale
  createdAt: string
  articleCount: number
  followerCount: number
  followingCount: number
  followedByMe: boolean
}

export interface ArticleListItem {
  id: number
  title: string
  summary: string | null
  cover: string | null
  author: AuthorInfo
  tags: TagDTO[]
  viewCount: number
  likeCount: number
  collectCount: number
  commentCount: number
  status: ArticleStatus
  publishedAt: string
}

export interface ArticleDetail extends ArticleListItem {
  contentMd: string
  contentHtml: string
  likedByMe: boolean
  collectedByMe: boolean
  updatedAt: string
}

export interface CommentItem {
  id: number
  articleId: number
  author: AuthorInfo
  content: string
  parentId: number | null
  replyCount: number
  createdAt: string
}

export interface RankItem {
  rank: number
  article: ArticleListItem
  score: number
}

export interface TeacherDTO {
  id: number
  name: string
  avatar: string | null
  bio: string | null
  courseCount?: number
}

export interface CourseTeacherInfo {
  id: number
  name: string
  avatar: string | null
  bio: string | null
}

export interface CourseListItem {
  id: number
  title: string
  cover: string | null
  videoUrl: string | null
  summary: string | null
  teacher: CourseTeacherInfo
  tags: TagDTO[]
  difficulty: CourseDifficulty
  enrollCount: number
  badge: string | null
  status: CourseStatus
  sortOrder: number
  publishedAt: string
}

export interface CourseDetail extends CourseListItem {
  audience: string[]
  enrolledByMe: boolean
  updatedAt: string
}

/// 课程分类直接复用文章标签表，额外带上该标签下的已上架课程数
export interface CourseCategoryDTO {
  id: number
  name: string
  slug: string
  courseCount: number
}

export interface EnrollmentItem {
  id: number
  user: { id: number; username: string; email: string; avatar: string | null }
  status: EnrollmentStatus
  createdAt: string
}

export interface EnrollmentResult {
  enrolled: boolean
  enrollCount: number
}

export interface AuthResult {
  accessToken: string
  user: UserProfile
}

export interface SearchResult {
  articles: ArticleListItem[]
  users: AuthorInfo[]
  totalArticles: number
  totalUsers: number
}

// ---------- 输入类型 ----------
export interface RegisterInput {
  username: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface UpdateProfileInput {
  username?: string
  bio?: string
  avatar?: string
  locale?: Locale
}

export interface ArticleInput {
  title: string
  summary?: string
  cover?: string
  contentMd: string
  tagIds: number[]
}

export interface CommentInput {
  content: string
  parentId?: number
}

export interface CourseInput {
  title: string
  cover?: string | null
  videoUrl?: string | null
  summary?: string | null
  audience?: string[]
  difficulty: CourseDifficulty
  badge?: string | null
  status?: CourseStatus
  sortOrder?: number
  teacherId: number
  tagIds: number[]
}

export interface TeacherInput {
  name: string
  avatar?: string | null
  bio?: string | null
}

export interface BannerDTO {
  id: number
  title: string
  subtitle: string | null
  image: string
  link: string
  enabled: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/// 直传上传配置：前端据此决定控件是否可用，以及前置校验的体积/格式上限
export interface UploadConfig {
  enabled: boolean
  maxBytes: number
  accept: string[]
}

/// 图片与视频共用同一形状，保留两个具名别名让调用处语义清晰
export type VideoUploadConfig = UploadConfig
export type ImageUploadConfig = UploadConfig

/// 浏览器用 ali-oss SDK 直传 OSS 所需的 STS 临时凭证（长期 AccessKey 不下发，
/// 会话策略已把可写的对象名钉死；expiration 是临时凭证自己的过期时间）
export interface OssUploadSts {
  region: string
  bucket: string
  key: string
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  expiration: string
  publicUrl: string
}

export type VideoUploadSts = OssUploadSts

export interface BannerInput {
  title: string
  subtitle?: string | null
  image: string
  link: string
  enabled?: boolean
  sortOrder?: number
}

export interface CursorPage {
  cursor?: string
  limit?: number
}

// ---------- 错误码 ----------
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  ARTICLE_NOT_FOUND: 'ARTICLE_NOT_FOUND',
  TAG_NOT_FOUND: 'TAG_NOT_FOUND',
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USERNAME_TOO_SHORT: 'USERNAME_TOO_SHORT',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  INVALID_EMAIL: 'INVALID_EMAIL',
  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  SEARCH_UNAVAILABLE: 'SEARCH_UNAVAILABLE',
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  TEACHER_NOT_FOUND: 'TEACHER_NOT_FOUND',
  TEACHER_IN_USE: 'TEACHER_IN_USE',
  BANNER_NOT_FOUND: 'BANNER_NOT_FOUND',
  VIDEO_UPLOAD_DISABLED: 'VIDEO_UPLOAD_DISABLED',
  IMAGE_UPLOAD_DISABLED: 'IMAGE_UPLOAD_DISABLED',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export const DEFAULT_TAGS = [
  { name: '前端', slug: 'frontend' },
  { name: '后端', slug: 'backend' },
  { name: '人工智能', slug: 'ai' },
  { name: '数据库', slug: 'database' },
  { name: '云原生', slug: 'cloud-native' },
  { name: '性能优化', slug: 'performance' },
  { name: 'Vue', slug: 'vue' },
  { name: 'React', slug: 'react' },
  { name: 'Node.js', slug: 'nodejs' },
  { name: '工具', slug: 'tools' },
] as const

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en'
}

/// 课程视频：只收浏览器能直接播放的封装格式，其它格式（如 .mov）需要转码，不在本期范围
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm']
export const VIDEO_MIME_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
}

/// 上传图片：只收浏览器能直接渲染的位图格式。**不含 SVG** —— 它是可执行脚本的
/// XML 文档，上传后能从 OSS 域名执行脚本，属于存储型 XSS 的常见入口。
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

/// 扩展名统一由服务端按 MIME 推导（不信客户端文件名，避免路径穿越）
export const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

/// 直接喂给 <input type=file accept=...> 的取值
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',')

/// 读取时的 WebP 转换：原图直传上 OSS，展示时由 OSS 图片处理（IMG）按需输出 WebP，
/// 上传链路与库里存的 URL 都不带这个参数（IMG 未开通时靠前端开关整体关掉）
export const OSS_IMAGE_WEBP_PROCESS = 'image/format,webp'

/// 上传到 OSS 的对象统一带这个缓存头：对象名是 UUID、内容永不改变，可以放心长期缓存。
/// 图片与视频（浏览器 SDK）都靠请求头携带，前后端共用这个常量避免漂移。
export const UPLOAD_CACHE_CONTROL = 'public,max-age=31536000,immutable'
