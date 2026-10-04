export type ProfileTab = 'articles' | 'collects' | 'courses'

/// 个人主页 tab 解析：?tab= 深链（顶栏「我的课程」、课程详情页报名后的入口）只认白名单值，
/// 且「收藏」「课程」是隐私数据，仅本人可见（与 GET /users/:id/collects、/users/:id/courses 的权限一致）
export function resolveProfileTab(queryTab: unknown, isSelf: boolean): ProfileTab {
  if (!isSelf) return 'articles'
  if (queryTab === 'collects' || queryTab === 'courses') return queryTab
  return 'articles'
}
