import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const anchor = Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000
const at = (minutes) => new Date(anchor + minutes * 60000).toISOString()
const task = (id, title, patch = {}) => ({
    id,
    title,
    status: 'todo',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: null,
    plannedEndAt: null,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: null,
    assigneeName: null,
    ...patch
})
const assistant = (id, assigneeName) => ({
    assigneeXpertId: id,
    assigneeName,
    assigneeAvatar: { emoji: { id: 'memo', unified: '1f4dd' }, background: 'var(--accent)' }
})
const graph = {
    projectId: 'preview',
    projectTitle: '客户服务知识库升级',
    canEditPlan: true,
    cursor: '1',
    diagnostics: [],
    tasks: [
        task('collect', '资料整理', { kind: 'summary', status: 'done' }),
        task('import', '导入服务文档', {
            parentTaskId: 'collect',
            status: 'done',
            plannedStartAt: at(0),
            estimatedDurationMs: 2400000,
            actualStartAt: at(0),
            actualEndAt: at(35),
            ...assistant('reader', '资料整理 Assistant')
        }),
        task('validate', '检查资料完整性', {
            parentTaskId: 'collect',
            status: 'done',
            predecessorIds: ['import'],
            plannedStartAt: at(40),
            estimatedDurationMs: 1800000,
            actualStartAt: at(36),
            actualEndAt: at(68),
            ...assistant('reader', '资料整理 Assistant')
        }),
        task('content', '知识内容编排', { kind: 'summary', status: 'in_progress', predecessorIds: ['validate'] }),
        task('taxonomy', '规划知识分类', {
            parentTaskId: 'content',
            status: 'done',
            plannedStartAt: at(70),
            estimatedDurationMs: 1800000,
            actualStartAt: at(70),
            actualEndAt: at(95),
            ...assistant('editor', '知识编排 Assistant')
        }),
        task('articles', '完善常见问题解答', {
            parentTaskId: 'content',
            status: 'in_progress',
            predecessorIds: ['taxonomy'],
            plannedStartAt: at(100),
            estimatedDurationMs: 3600000,
            ...assistant('editor', '知识编排 Assistant')
        }),
        task('review', '独立审核知识内容', {
            parentTaskId: 'content',
            predecessorIds: ['articles'],
            plannedStartAt: at(160),
            estimatedDurationMs: 1800000,
            ...assistant('reviewer', '质量审核 Assistant')
        }),
        task('release', '发布与验证', { kind: 'summary' }),
        task('index', '构建检索索引', {
            parentTaskId: 'release',
            predecessorIds: ['review'],
            plannedStartAt: at(190),
            estimatedDurationMs: 2400000,
            ...assistant('retrieval', '检索 Assistant')
        }),
        task('evaluate', '执行问答效果评估', {
            parentTaskId: 'release',
            predecessorIds: ['index'],
            plannedStartAt: at(230),
            estimatedDurationMs: 3000000,
            ...assistant('reviewer', '质量审核 Assistant')
        }),
        task('launch', '知识库发布', {
            parentTaskId: 'release',
            kind: 'milestone',
            predecessorIds: ['evaluate'],
            plannedStartAt: at(280),
            estimatedDurationMs: 0
        }),
        task('manual', '人工核对高风险问答', {
            status: 'review',
            plannedStartAt: at(180),
            estimatedDurationMs: 1800000
        }),
        task('managed', '同步外部知识来源', {
            status: 'blocked',
            providerKey: 'knowledge.tasks',
            diagnostic: '等待资料负责人补充最新产品说明。'
        })
    ],
    executions: [
        {
            id: 'import-1',
            taskId: 'import',
            attempt: 1,
            status: 'success',
            runtimeStatus: 'success',
            agentExecutionId: 'execution-import',
            runtimeStartedAt: at(0),
            runtimeCompletedAt: at(35),
            outputSummary: '已整理 28 份服务文档，并建立来源索引。'
        },
        {
            id: 'attempt-1',
            taskId: 'articles',
            attempt: 1,
            status: 'failed',
            runtimeStatus: 'success',
            agentExecutionId: 'execution-1',
            runtimeStartedAt: at(100),
            runtimeCompletedAt: at(112),
            outputSummary: 'rejected',
            error: '部分答案缺少来源引用，已保留草稿。'
        },
        {
            id: 'attempt-2',
            taskId: 'articles',
            attempt: 2,
            status: 'running',
            runtimeStatus: 'running',
            agentExecutionId: 'execution-2',
            runtimeStartedAt: at(115),
            runtimeCompletedAt: null,
            outputSummary: '正在补充答案来源，统一问题分类与表述。'
        }
    ]
}
if (process.env.TASKS_PREVIEW_SCENARIO === 'empty') graph.tasks = graph.executions = []
if (process.env.TASKS_PREVIEW_SCENARIO === 'readonly') graph.canEditPlan = false
const dark = process.env.TASKS_PREVIEW_THEME === 'dark'
export default {
    title: '通用项目任务 · 交互预览',
    frameTitle: '项目任务',
    workspaceRoot: resolve(root, '../../../../../..'),
    component: { root, runtime: 'react' },
    instanceId: 'project-tasks-preview',
    hostContext: {
        locale: process.env.TASKS_PREVIEW_LOCALE ?? 'zh-CN',
        manifest: { key: 'timeline', hostType: process.env.TASKS_PREVIEW_HOST === 'project' ? 'project' : 'agent' },
        theme: {
            mode: dark ? 'dark' : 'light',
            tokens: {
                colorPrimary: dark ? '#6699ff' : '#155dfb',
                colorAccent: dark ? '#1f2937' : '#eff4ff',
                colorAccentForeground: dark ? '#e5e7eb' : '#155dfb',
                ...(dark
                    ? {
                          colorBackground: '#09090b',
                          colorForeground: '#fafafa',
                          colorCard: '#18181b',
                          colorPopover: '#18181b',
                          colorMuted: '#27272a',
                          colorMutedForeground: '#a1a1aa',
                          colorBorder: '#3f3f46',
                          colorInput: '#3f3f46',
                          colorSecondary: '#27272a',
                          colorSuccess: '#34d399',
                          colorWarning: '#fbbf24',
                          colorDestructive: '#f87171'
                      }
                    : {})
            }
        }
    },
    state: { graph, navigation: null },
    exposeState: true,
    async handleRequest(message, { state }) {
        if (message.type === 'requestData') return { data: { item: state.graph } }
        if (message.type === 'executeAction') {
            if (message.actionKey === 'execution-target') {
                const attempt = state.graph.executions.find((item) => item.id === message.input.taskExecutionId)
                if (!attempt?.agentExecutionId) throw Error('找不到关联的执行记录。')
                return {
                    data: {
                        success: true,
                        data: {
                            target: 'assistant.conversation',
                            projectId: 'preview',
                            conversationId: `conversation-${attempt.id}`,
                            threadId: `thread-${attempt.id}`,
                            executionId: attempt.agentExecutionId,
                            xpertId: 'preview-assistant'
                        }
                    }
                }
            }
            if (message.actionKey !== 'change') throw Error('不支持的操作。')
            if (!state.graph.canEditPlan) throw Error('没有编辑此项目的权限。')
            const task = state.graph.tasks.find((task) => task.id === message.input.taskId)
            if (!task || task.revision !== message.input.expectedRevision)
                throw Error('任务版本已变化，请刷新后重新编辑。')
            if (task.providerKey && ('parentTaskId' in message.input || 'predecessorIds' in message.input))
                throw Error('应用管理的任务不能修改层级或依赖。')
            if (
                message.input.estimatedDurationMs != null &&
                (!Number.isFinite(message.input.estimatedDurationMs) || message.input.estimatedDurationMs < 0)
            )
                throw Error('无效的预计时长。')
            Object.assign(task, message.input, { revision: task.revision + 1 })
            state.graph.cursor = String(Number(state.graph.cursor) + 1)
            return { data: { success: true, data: state.graph } }
        }
        if (message.type === 'invokeClientCommand') {
            state.navigation = message.payload
            return { data: { success: true, previewOnly: true } }
        }
        return { data: {} }
    }
}
