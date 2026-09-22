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
