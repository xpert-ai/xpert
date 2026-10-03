import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const task = {
    id: '11111111-1111-4111-8111-111111111111',
    name: '每日项目进展摘要',
    prompt: '整理项目进展、待办和风险，生成摘要。',
    options: { frequency: 'Daily', time: '09:00' },
    timeZone: 'Asia/Shanghai',
    status: 'scheduled',
    scheduleDescription: '每天 09:00',
    runs: [
        {
            id: '22222222-2222-4222-8222-222222222222',
            title: '项目进展摘要',
            status: 'success',
            createdAt: '2026-09-29T01:00:00Z'
        }
    ],
    total: 1,
    page: 1,
    pageSize: 10
}
export default {
    title: 'Scheduler detail · fixture preview',
    frameTitle: 'Scheduled task',
    workspaceRoot: resolve(root, '../../../../../..'),
    component: { root, runtime: 'react' },
    instanceId: 'scheduler-preview',
    hostContext: {
        locale: 'zh-CN',
        manifest: { key: 'platform.scheduler__detail', hostType: 'agent' },
        initialQuery: { selectionId: task.id },
        theme: { mode: 'light', tokens: {} }
    },
    state: { task, navigation: null },
    exposeState: true,
    async handleRequest(message, { state }) {
        if (message.type === 'requestData') return { data: { item: state.task } }
        if (message.type === 'executeAction') {
            if (message.actionKey === 'save') Object.assign(state.task, message.input)
            if (message.actionKey === 'pause') state.task.status = 'paused'
            if (message.actionKey === 'resume') state.task.status = 'scheduled'
            if (message.actionKey === 'execution-target')
                return {
                    data: {
                        success: true,
                        data: { target: 'assistant.conversation', conversationId: message.input.conversationId }
                    }
                }
            return { data: { success: true, refresh: true } }
        }
        if (message.type === 'invokeClientCommand') {
            state.navigation = message.payload
            return { data: { success: true } }
        }
        throw Error('Unsupported preview request')
    }
}
