import base from './tree.preview.config.mjs'

const { conversation, branches } = base.state
const conversationId = conversation.conversationId
const threadId = branches[0].threadId
const replyId = '55555555-5555-4555-8555-555555555555'
const preferences = {
    ...base.state.preferences,
    mode: 'growth',
    trailConversationId: conversationId,
    ...(process.env.TRAIL_PREVIEW_EXECUTION === '1' ? { trailMessageId: replyId } : {})
}
const common = { version: 1, conversationId, threadId, title: '修复审计缺口', coverage: [], live: false }
const discussion = {
    ...common,
    layer: 'conversation',
    lanes: [
        { id: 'common', parentId: null, title: '共同历史', primary: true, status: 'success', threadId },
        {
            id: 'main',
            parentId: 'common',
            spawnStepId: 'turn-1',
            title: '当前讨论',
            primary: true,
            status: 'success',
            threadId
        },
        {
            id: 'side',
            parentId: 'common',
            spawnStepId: 'turn-1',
            title: '比较替代方案',
            primary: false,
            status: 'success',
            threadId: branches[1].threadId
        }
    ],
    steps: [
        {
            id: 'turn-1',
            laneId: 'common',
            title: '请调查 phase 12 的审计缺口',
            answer: '验证发现 1 个缺口，需要补齐运行记录。'
        },
        { id: 'turn-2', laneId: 'main', title: '修复缺口并重新验证', answer: '完成修复；重新验证通过。' },
        {
            id: 'turn-3',
            laneId: 'side',
            title: '如果使用另一种实现方式呢？',
            answer: '可以复用现有记录接口，保留权限边界。',
            threadId: branches[1].threadId
        }
    ].map((step, order) => ({
        kind: 'turn',
        activity: 'task',
        status: 'success',
        order,
        threadId,
        messageId: replyId,
        executionId: 'root',
        preview: step.title,
        ...step
    })),
    episodes: [1, 2, 3].map((n) => ({
        id: `discussion-${n}`,
        laneId: ['common', 'main', 'side'][n - 1],
        activity: 'task',
        stepIds: [`turn-${n}`]
    }))
}
const execution = {
    ...common,
    layer: 'execution',
    messageId: replyId,
    coverage: ['timing_unavailable'],
    lanes: [
        { id: 'root', parentId: null, title: '主 Agent', primary: true, status: 'success', elapsedMs: 2760000 },
        {
            id: 'verify',
            parentId: 'root',
            spawnStepId: 'delegate-verify',
            title: 'Verify phase 12',
            primary: false,
            status: 'success',
            elapsedMs: 1980000,
            outcome: { status: 'failed', accepted: false, message: '发现 1 个缺口' }
        },
        {
            id: 'fix',
            parentId: 'root',
            spawnStepId: 'delegate-fix',
            title: 'Fix audit gap',
            primary: false,
            status: 'success',
            elapsedMs: 720000
        },
        {
            id: 'reverify',
            parentId: 'root',
            spawnStepId: 'delegate-reverify',
            title: 'Re-verify phase 12',
            primary: false,
            status: 'success',
            elapsedMs: 60000,
            outcome: { status: 'passed', accepted: true, message: '验证通过' }
        }
    ],
    steps: [],
    episodes: []
}
const add = (laneId, activity, count, title, fail = false) => {
    const stepIds = []
    const groupId = execution.episodes.length
    for (let i = 0; i < count; i++) {
        const id = `${laneId}-${activity}-${groupId}-${i}`
        stepIds.push(id)
        execution.steps.push({
            id,
            laneId,
            kind: 'tool',
            activity,
            title: `${title} ${i + 1}`,
            status: fail && i === count - 1 ? 'error' : 'success',
            order: execution.steps.length,
            threadId,
            messageId: replyId,
            input: '{"path":"src/audit.ts"}',
            output: fail && i === count - 1 ? '发现缺失测试' : '检查完成'
        })
    }
    execution.episodes.push({ id: `episode-${laneId}-${activity}-${groupId}`, laneId, activity, stepIds })
}
const delegate = (lane) => {
    const id = `delegate-${lane}`
    execution.steps.push({
        id,
        laneId: 'root',
        kind: 'tool',
        activity: 'task',
        title: `委派 ${lane}`,
        status: 'success',
        order: execution.steps.length,
        threadId,
        messageId: replyId
    })
    execution.episodes.push({ id: `episode-${id}`, laneId: 'root', activity: 'task', stepIds: [id] })
}
delegate('verify')
add('verify', 'explore', 9, '检查执行记录')
add('verify', 'verify', 6, '验证审计规则', true)
delegate('fix')
add('fix', 'explore', 4, '定位调用点')
add('fix', 'change', 8, '补齐审计字段')
add('fix', 'verify', 4, '运行回归测试')
delegate('reverify')
add('reverify', 'explore', 3, '读取修改')
add('reverify', 'verify', 5, '重新验证')
execution.steps.push({
    id: 'answer',
    laneId: 'root',
    kind: 'message',
    activity: 'answer',
    title: '审计缺口已修复，验证通过。',
    preview: '已补齐执行记录，所有回归测试通过。',
    status: 'success',
    order: execution.steps.length,
    threadId,
    messageId: replyId
})
execution.episodes.push({ id: 'episode-answer', laneId: 'root', activity: 'answer', stepIds: ['answer'] })
if (process.env.TRAIL_PREVIEW_SCENARIO === 'large') {
    for (let i = 0; i < 200; i++) add('fix', 'other', 24, `activity ${i}`)
}
export default {
    ...base,
    title: 'Conversation Map · growth tree',
    hostContext: { ...base.hostContext, initialQuery: { parameters: preferences } },
    state: { ...base.state, preferences, queries: [], discussion, execution },
    async handleRequest(message, context) {
        if (message.type === 'requestData') {
            const parameters = message.query?.parameters ?? {}
            context.state.queries.push(parameters)
            if (parameters.operation === 'trail') {
                const graph = parameters.messageId ? context.state.execution : context.state.discussion
                if (process.env.TRAIL_PREVIEW_SCENARIO === 'live') {
                    const reads = context.state.queries.filter((query) => query.operation === 'trail').length
                    return { data: { item: { ...graph, live: reads < 3 } } }
                }
                if (process.env.TRAIL_PREVIEW_SCENARIO === 'empty')
                    return {
                        data: { item: { ...graph, lanes: [], steps: [], episodes: [], coverage: ['no_execution'] } }
                    }
                return { data: { item: { ...graph, threadId: parameters.threadId ?? graph.threadId } } }
            }
        }
        const result = await base.handleRequest(message, context)
        if (message.type === 'requestData') result.data.item.currentConversationId = conversationId
        return result
    }
}
