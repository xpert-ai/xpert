import { GENERAL_PROJECT_TYPE, SPACE_PROJECT_TYPE, resolveI18nText } from '@xpert-ai/contracts'
import { z } from 'zod'

const title = z.union([z.string(), z.object({ en_US: z.string(), zh_Hans: z.string().optional(), zh_Hant: z.string().optional() })]).nullish()
const classification = z.object({ applicationKey: z.string().nullish(), projectTypeKey: z.string().nullish() })
const project = classification.extend({
    id: z.string().uuid(), name: z.string(), description: z.string().nullish(), typeTitle: title,
    updatedAt: z.string().datetime({ offset: true }), archived: z.boolean(), myRole: z.enum(['owner', 'manager', 'editor', 'member']), canEdit: z.boolean(), canManage: z.boolean()
})
export const directory = z.object({
    items: z.array(project), total: z.number().int().nonnegative(),
    summary: z.object({ assistantName: z.string(), types: z.array(classification.extend({ title })) })
})
export type Project = z.infer<typeof project>
export type ProjectType = z.infer<typeof classification>
export function typeKey(type: ProjectType) {
    return JSON.stringify([type.applicationKey ?? null, type.projectTypeKey ?? null])
}

const en = {
    title: 'Project list', refresh: 'Refresh', all: 'All accessible', manageable: 'I can manage', search: 'Search project names or descriptions',
    types: 'All types', name: 'Project name', type: 'Project type', role: 'My role', updated: 'Last updated', actions: 'Actions',
    owner: 'Owner', manager: 'Manager', editor: 'Editor', member: 'Member', configure: 'Configure', open: 'Open',
    archived: 'Archived', today: 'Today', yesterday: 'Yesterday', general: 'General project', space: 'Writing space', unclassified: 'Unclassified', empty: 'No accessible projects',
    emptyManage: 'No projects you can manage', noMatch: 'No matching projects', loading: 'Loading projects…', retry: 'Retry',
    openFailed: 'Could not open this project view.', failed: 'Could not load the project list.', prev: 'Previous', next: 'Next'
}
const zh: typeof en = {
    title: '项目列表', refresh: '刷新', all: '全部可访问', manageable: '我可管理', search: '搜索项目名称或描述', types: '全部类型',
    name: '项目名称', type: '项目类型', role: '我的角色', updated: '最近更新', actions: '操作',
    owner: '所有者', manager: '管理员', editor: '编辑者', member: '成员', configure: '配置', open: '打开',
    archived: '已归档', today: '今天', yesterday: '昨天', general: '通用项目', space: '协作空间', unclassified: '未分类', empty: '暂无可访问的项目', emptyManage: '暂无可管理的项目',
    noMatch: '没有匹配的项目', loading: '正在加载项目…', retry: '重试', openFailed: '无法打开此项目视图。', failed: '项目列表加载失败。',
    prev: '上一页', next: '下一页'
}
export const labels = (locale: string) => locale.startsWith('zh') ? zh : en
export function typeLabel(type: ProjectType, value: z.infer<typeof title>, locale: string) {
    const label = resolveI18nText(value, locale)
    if (label) return label
    const t = labels(locale)
    if (typeKey(type) === typeKey(GENERAL_PROJECT_TYPE)) return t.general
    if (typeKey(type) === typeKey(SPACE_PROJECT_TYPE)) return t.space
    return type.projectTypeKey || t.unclassified
}
