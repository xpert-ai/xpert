// Deterministic outcome fixtures for issue #1237; these are not live runtime executions.
import config from './preview.config.mjs'

const zh = config.hostContext.locale.startsWith('zh')
const anchor = Math.floor(Date.now() / 3600000) * 3600000 - 3600000
const at = (minutes) => new Date(anchor + minutes * 60000).toISOString()
const base = config.state.graph.tasks.find((task) => task.id === 'articles')
const task = (id, title, status) => ({
    ...base,
    id,
    title,
    status,
    parentTaskId: null,
    predecessorIds: [],
    plannedStartAt: at(0),
    plannedEndAt: at(55),
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null
})
const execution = (taskId, attempt, runtimeStatus, from, to, patch = {}) => ({
    id: `${taskId}-${attempt}`,
    taskId,
    attempt,
    status: runtimeStatus,
    runtimeStatus,
    runtimeStartedAt: at(from),
    runtimeCompletedAt: to == null ? null : at(to),
    ...patch
})
const mixed = ['blocked', 'done', 'in_progress'].map((status) =>
    task(status, `${zh ? '失败后重试成功' : 'Failed then retried successfully'} · ${status}`, status)
)
config.title = 'Issue 1237 · Gantt outcome fixtures'
config.hostContext.viewState = { initialTab: 'gantt' }
config.state.graph = {
    ...config.state.graph,
    canEditPlan: false,
    tasks: [
        ...mixed,
        task('business', zh ? '运行成功，业务拒绝' : 'Runtime success, business rejected', 'blocked'),
        task('running', zh ? '正在执行' : 'Running execution', 'in_progress'),
        task('cancelled', zh ? '执行已取消' : 'Cancelled execution', 'done'),
        task('unknown', zh ? '执行状态未知' : 'Unknown execution outcome', 'done'),
        {
            ...task('legacy', zh ? '旧数据：仅任务时间' : 'Legacy task timestamps only', 'done'),
            actualStartAt: at(0),
            actualEndAt: at(50)
        }
    ],
    executions: [
        ...mixed.flatMap(({ id }) => [
            execution(id, 1, 'failed', 0, 20, { error: zh ? '连接中断，请重试。' : 'Connection lost. Please retry.' }),
            execution(id, 2, 'succeeded', 25, 50)
        ]),
        execution('business', 1, 'success', 0, 50, { status: 'failed', outputSummary: 'rejected' }),
        execution('running', 1, 'running', 25, null),
        execution('cancelled', 1, 'cancelled', 0, 50),
        execution('unknown', 1, 'unknown', 0, 50)
    ]
}
export default config
