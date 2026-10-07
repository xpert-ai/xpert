import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const mode = process.env.TOPIC_MAP_PREVIEW_THEME ?? 'light'
// Supply host semantic tokens as the real Workbench does; the SDK shell has light defaults.
const tokens =
    mode === 'dark'
        ? {
              colorBackground: '#09090b',
              colorForeground: '#fafafa',
              colorCard: '#18181b',
              colorCardForeground: '#fafafa',
              colorPopover: '#18181b',
              colorPopoverForeground: '#fafafa',
              colorSecondary: '#27272a',
              colorSecondaryForeground: '#fafafa',
              colorMuted: '#27272a',
              colorMutedForeground: '#a1a1aa',
              colorAccent: '#27272a',
              colorAccentForeground: '#fafafa',
              colorBorder: '#3f3f46',
              colorInput: '#3f3f46',
              colorPrimary: '#fafafa',
              colorPrimaryForeground: '#18181b',
              colorInfo: '#60a5fa'
          }
        : {}
const projectId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const threadId = '33333333-3333-4333-8333-333333333333'
const sideId = '44444444-4444-4444-8444-444444444444'
const messageId = '55555555-5555-4555-8555-555555555555'
const updatedAt = '2026-10-07T06:30:00.000Z'
const lastHumanMessage = {
    id: messageId,
    text: '如果交付延期两周，如何调整采购计划？请比较备用供应商的价格、交付周期与质量风险。',
    createdAt: '2026-10-07T06:28:00.000Z',
    inherited: false
}
const preferences = {
    projectId,
    mode: 'list',
    direction: 'TB',
    style: 'compact',
    showHistory: false,
    showShared: false
}
const initialQuery = { parameters: preferences }
const conversation = {
    id: `conversation:${conversationId}`,
    kind: 'conversation',
    conversationId,
    threadId,
    parentId: `project:${projectId}`,
    title: '供应商选择',
    updatedAt,
    lastHumanMessage,
    preview: '',
    expandable: true
}
const branches = [threadId, sideId].map((id, index) => ({
    id: `thread:${id}`,
    kind: 'thread',
    conversationId,
    threadId: id,
    parentId: conversation.id,
    parentThreadId: index ? threadId : null,
    title: index ? '供应风险分析' : '当前讨论',
    conversationTitle: conversation.title,
    updatedAt,
    lastHumanMessage: { ...lastHumanMessage, inherited: index !== 0 },
    preview: '',
    status: index ? 'running' : 'idle',
    current: index === 0,
    expandable: true
}))
const turn = {
    id: `turn:${threadId}:${messageId}`,
    kind: 'turn',
    conversationId,
    threadId,
    messageId,
    parentId: branches[0].id,
    title: '评估交付延期',
    conversationTitle: conversation.title,
    updatedAt,
    preview: '如果交付延期两周，如何调整采购计划？',
    answer: '建议启用备用供应商，并调整采购与库存计划。',
    expandable: false,
    branchAvailable: false,
    branchReason: 'checkpoint_unavailable',
    threadIds: [threadId, sideId],
    branchOptions: branches.map((branch) => ({ threadId: branch.threadId, title: branch.title }))
}

export default {
    title: 'Conversation Map · controls acceptance',
    frameTitle: 'Conversation Map',
    workspaceRoot: resolve(root, '../../../../../../..'),
    component: { root, runtime: 'react' },
    instanceId: 'conversation-map-preview',
    isolatedOrigin: true,
    hostContext: {
        locale: process.env.TOPIC_MAP_PREVIEW_LOCALE ?? 'zh-Hans',
        manifest: { key: 'platform.conversation-map__topics', hostType: 'agent' },
        initialQuery,
        theme: { mode, density: 'compact', tokens },
        debug: { enabled: false, production: true }
    },
    state: { preferences, conversation, branches, requests: 0, renames: 0, actions: [], navigations: [] },
    exposeState: true,
    async handleRequest(message, { state }) {
        if (message.type === 'requestData') {
            state.requests++
            const query = message.query ?? {},
                parameters = query.parameters ?? {}
            let nodes = []
            if (parameters.projectId !== null) {
                if (query.search || parameters.threadId) {
                    const branch = state.branches.find((item) => item.threadId === parameters.threadId)
                    nodes = [{ ...turn, ...(branch ? { threadId: branch.threadId, parentId: branch.id } : {}) }]
                } else nodes = parameters.conversationId ? state.branches : [state.conversation]
            }
            return {
                data: {
                    item: {
                        nodes,
                        total: nodes.length,
                        nextOffset: null,
                        currentConversationId: null,
                        projectId: parameters.projectId === null ? null : projectId,
                        projectTitle: parameters.projectId === null ? '未归入项目' : '采购优化',
                        projectUpdatedAt: parameters.projectId === null ? undefined : updatedAt,
                        assistantId: 'preview-assistant',
                        projects: [{ id: projectId, name: '采购优化' }]
                    }
                }
            }
        }
        if (message.type === 'invokeClientCommand' && message.payload?.target === 'workbench.view') {
            Object.assign(state.preferences, message.payload.parameters)
            // The shared host fixes init at startup; inspect persisted command state through exposeState.
            // Refresh persistence is verified against the real Workbench URL state.
            return { data: { success: true } }
        }
        if (message.type === 'invokeClientCommand' && message.payload?.target === 'assistant.conversation') {
            state.navigations.push(message.payload)
            return { data: { success: true } }
        }
        if (message.type === 'executeAction' && ['locate', 'side-chat'].includes(message.input?.type)) {
            const input = message.input
            const branch = state.branches.find((item) => item.threadId === input.threadId)
            if (input.conversationId !== conversationId || !branch) throw Error('Invalid target')
            if (input.type === 'side-chat' && branch.status !== 'idle') throw Error('Branch is not idle')
            state.actions.push(input)
            // Record dispatch only: this fixture never creates a real conversation or navigates the browser.
            return {
                data: {
                    success: true,
                    data: {
                        target: 'assistant.conversation',
                        conversationId,
                        threadId: branch.threadId,
                        ...(input.messageId ? { messageId: input.messageId } : {}),
                        xpertId: 'preview-assistant',
                        projectId,
                        preserveView: true,
                        viewKey: 'platform.conversation-map__topics'
                    }
                }
            }
        }
        if (message.type === 'executeAction' && message.input?.type === 'rename') {
            const input = message.input
            const node = input.threadId
                ? state.branches.find((item) => item.threadId === input.threadId)
                : state.conversation
            if (!node || input.conversationId !== conversationId || !input.title?.trim()) throw Error('Invalid rename')
            node.title = input.title.trim()
            state.renames++
            return { data: { success: true, data: { renamed: true } } }
        }
        throw Error('Unsupported controls fixture request.')
    }
}
