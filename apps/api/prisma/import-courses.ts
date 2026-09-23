/**
 * 批量导入讲师与课程：走管理员 HTTP API，不直连数据库。
 *
 * 用法（默认 dry-run，只打印将要做什么；加 --apply 才真正写入）：
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   API_BASE_URL=https://example.com/api/v1 \
 *   npx ts-node prisma/import-courses.ts --file courses.json --apply
 *
 * 参数：
 *   --file <path>  必填，JSON 数据文件
 *   --stdin        从标准输入读 JSON（与 --file 二选一，容器内管道传数据更方便）
 *   --apply        真正写入（省略则只做 dry-run）
 *   --update       已存在的讲师/课程改为 PATCH 更新；省略则跳过不动
 *
 * 仓库内附了一份可直接改的样例：prisma/courses.example.json
 *
 * JSON 结构：
 * {
 *   "teachers": [{ "name": "周晓", "avatar": null, "bio": "前端技术专家" }],
 *   "courses": [{
 *     "title": "Vue 3 实战",
 *     "teacher": "周晓",                 // 按姓名关联，可引用本次新建的讲师
 *     "summary": "课程简介",
 *     "audience": ["有 Vue 基础的开发者"],
 *     "difficulty": "beginner",          // beginner | elementary | intermediate | advanced
 *     "badge": "新课",
 *     "status": "published",             // draft | published，published 会自动写发布时间
 *     "sortOrder": 10,
 *     "cover": null,                     // 建议填 OSS/CDN 绝对地址，本地路径生产读不到
 *     "tagSlugs": ["frontend"]           // 复用标签表，未知 slug 会被忽略并告警
 *   }]
 * }
 *
 * 幂等性：讲师按 name、课程按 title 匹配，重复执行不会产生重复数据。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const DIFFICULTIES = ['beginner', 'elementary', 'intermediate', 'advanced'] as const
const STATUSES = ['draft', 'published'] as const

type Difficulty = (typeof DIFFICULTIES)[number]
type CourseStatus = (typeof STATUSES)[number]

interface TeacherSeed {
  name: string
  avatar?: string | null
  bio?: string | null
}

interface CourseSeed {
  title: string
  teacher: string
  cover?: string | null
  summary?: string | null
  audience?: string[]
  difficulty?: Difficulty
  badge?: string | null
  status?: CourseStatus
  sortOrder?: number
  tagSlugs?: string[]
}

interface SeedFile {
  teachers?: TeacherSeed[]
  courses?: CourseSeed[]
}

interface TagRow {
  id: number
  slug: string
}

interface CourseRow {
  id: number
  title: string
}

const args = process.argv.slice(2)
const shouldApply = args.includes('--apply')
const shouldUpdate = args.includes('--update')
const shouldReadStdin = args.includes('--stdin')
const fileFlag = args.indexOf('--file')
const filePath = fileFlag >= 0 ? args[fileFlag + 1] : undefined

// 全局限流是 120 次/60 秒，这里留足余量，避免后半程 429
const MIN_INTERVAL_MS = 700
let lastRequestAt = 0

function sleep(ms: number) {
  return new Promise((done) => setTimeout(done, ms))
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const payload = text ? (JSON.parse(text) as { data?: T; message?: unknown }) : {}
  if (!res.ok) {
    const detail = payload.message ?? payload
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(detail)}`)
  }
  return payload.data as T
}

function loadSeedFile(): SeedFile {
  const source = shouldReadStdin
    ? readFileSync(0, 'utf8')
    : filePath
      ? readFileSync(resolve(process.cwd(), filePath), 'utf8')
      : null
  if (source === null) throw new Error('缺少 --file <path> 或 --stdin 参数')
  // Windows 编辑器（记事本 / PowerShell Set-Content）常带 BOM，去掉再解析
  return JSON.parse(source.replace(/^\uFEFF/, '')) as SeedFile
}

function assertSeed(seed: SeedFile) {
  for (const [index, teacher] of (seed.teachers ?? []).entries()) {
    if (!teacher.name?.trim()) throw new Error(`teachers[${index}].name 不能为空`)
  }
  for (const [index, course] of (seed.courses ?? []).entries()) {
    if (!course.title?.trim()) throw new Error(`courses[${index}].title 不能为空`)
    if (!course.teacher?.trim()) throw new Error(`courses[${index}].teacher 不能为空`)
    if (course.difficulty && !DIFFICULTIES.includes(course.difficulty)) {
      throw new Error(`courses[${index}].difficulty 取值非法：${course.difficulty}`)
    }
    if (course.status && !STATUSES.includes(course.status)) {
      throw new Error(`courses[${index}].status 取值非法：${course.status}`)
    }
  }
}

async function login(): Promise<string> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('缺少 ADMIN_EMAIL / ADMIN_PASSWORD 环境变量')
  }
  const result = await request<{ accessToken: string }>('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  return result.accessToken
}

async function fetchCourses(token: string): Promise<Map<string, number>> {
  const byTitle = new Map<string, number>()
  let cursor: string | undefined
  for (let guard = 0; guard < 200; guard += 1) {
    const query = new URLSearchParams({ status: 'all', limit: '24' })
    if (cursor) query.set('cursor', cursor)
    const page = await request<{ items: CourseRow[]; nextCursor: string | null }>(
      'GET',
      `/courses?${query.toString()}`,
      undefined,
      token,
    )
    for (const item of page.items) byTitle.set(item.title, item.id)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return byTitle
}

function tagIdsFor(slugs: string[] | undefined, tagIdBySlug: Map<string, number>): number[] {
  if (!slugs?.length) return []
  return slugs.flatMap((slug) => {
    const id = tagIdBySlug.get(slug)
    if (id === undefined) {
      console.warn(`  ! 未知标签 slug「${slug}」，已忽略`)
      return []
    }
    return [id]
  })
}

async function main() {
  const seed = loadSeedFile()
  assertSeed(seed)

  const mode = shouldApply ? 'APPLY' : 'DRY-RUN'
  console.log(`==> ${mode} · ${API_BASE_URL}`)
  console.log(`    讲师 ${seed.teachers?.length ?? 0} 位，课程 ${seed.courses?.length ?? 0} 门`)

  const token = await login()
  const teacherIdByName = new Map(
    (await request<{ id: number; name: string }[]>('GET', '/teachers', undefined, token)).map(
      (it) => [it.name, it.id] as const,
    ),
  )
  const tagIdBySlug = new Map(
    (await request<TagRow[]>('GET', '/tags', undefined, token)).map(
      (it) => [it.slug, it.id] as const,
    ),
  )
  const courseIdByTitle = await fetchCourses(token)

  console.log(`    远端已有：讲师 ${teacherIdByName.size} 位，课程 ${courseIdByTitle.size} 门`)

  let created = 0
  let updated = 0
  let skipped = 0
  // dry-run 下新建的讲师拿不到真实 id，先记下来，课程引用时用占位值展示
  const pendingTeacherNames = new Set<string>()

  for (const teacher of seed.teachers ?? []) {
    const existingId = teacherIdByName.get(teacher.name)
    const payload = {
      name: teacher.name.trim(),
      avatar: teacher.avatar ?? null,
      bio: teacher.bio ?? null,
    }
    if (existingId === undefined) {
      console.log(`  + 讲师 ${teacher.name}`)
      created += 1
      if (shouldApply) {
        const row = await request<{ id: number }>('POST', '/teachers', payload, token)
        teacherIdByName.set(teacher.name, row.id)
      } else pendingTeacherNames.add(teacher.name)
    } else if (shouldUpdate) {
      console.log(`  ~ 讲师 ${teacher.name} (id=${existingId})`)
      updated += 1
      if (shouldApply) await request('PATCH', `/teachers/${existingId}`, payload, token)
    } else {
      console.log(`  = 讲师 ${teacher.name} 已存在，跳过`)
      skipped += 1
    }
  }

  for (const course of seed.courses ?? []) {
    let teacherId = teacherIdByName.get(course.teacher)
    if (teacherId === undefined && pendingTeacherNames.has(course.teacher)) teacherId = 0
    if (teacherId === undefined) {
      throw new Error(
        `课程「${course.title}」引用了不存在的讲师「${course.teacher}」，请先在 teachers 中声明`,
      )
    }
    const payload = {
      title: course.title.trim(),
      cover: course.cover ?? null,
      summary: course.summary ?? null,
      audience: course.audience ?? [],
      difficulty: course.difficulty ?? 'beginner',
      badge: course.badge ?? null,
      status: course.status ?? 'published',
      sortOrder: course.sortOrder ?? 0,
      teacherId,
      tagIds: tagIdsFor(course.tagSlugs, tagIdBySlug),
    }
    const existingId = courseIdByTitle.get(course.title)
    if (existingId === undefined) {
      console.log(`  + 课程 ${course.title}（${course.teacher}）`)
      created += 1
      if (shouldApply) await request('POST', '/courses', payload, token)
    } else if (shouldUpdate) {
      console.log(`  ~ 课程 ${course.title} (id=${existingId})`)
      updated += 1
      if (shouldApply) await request('PATCH', `/courses/${existingId}`, payload, token)
    } else {
      console.log(`  = 课程 ${course.title} 已存在，跳过`)
      skipped += 1
    }
  }

  console.log(`\n==> ${mode} 完成：新建 ${created}，更新 ${updated}，跳过 ${skipped}`)
  if (!shouldApply) console.log('    加 --apply 才会真正写入')
}

main().catch((error: unknown) => {
  console.error(`\n导入失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
