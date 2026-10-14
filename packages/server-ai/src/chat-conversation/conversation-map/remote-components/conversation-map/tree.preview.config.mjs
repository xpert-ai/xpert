import base from './preview.config.mjs'

const { conversation, branches } = base.state
const messageId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const threadInfo = branches.map((branch) => ({
    threadId: branch.threadId,
    title: branch.title,
    current: branch.current,
    status: 'idle'
}))
// Mirror the production DTO: summary bodies only, never an embedded list of messages.
const segment = (start, end, question, reply, threads, parentId = conversation.id) => ({
    id: `segment:${conversation.conversationId}:${messageId(start)}`,
    kind: 'segment',
    parentId,
    conversationId: conversation.conversationId,
    conversationTitle: conversation.title,
    threadId: threads[0].threadId,
    segmentThreads: threads,
    title: threads[0].title,
    messageCount: end - start + 1,
    endMessageId: messageId(end),
    messageId: messageId(end - 1),
    lastHumanMessage: { id: messageId(end - 1), text: question, inherited: threads.length > 1 },
    answer: reply,
    current: threads.some((thread) => thread.current),
    preview: '',
    expandable: false
})
const root = segment(
    1,
    2,
    '我们需要制定供应商采购计划。',
    '先比较交付周期、质量与价格。从这条回复分成两条讨论路径。',
    threadInfo
)
root.expandable = true
const segments =
    process.env.TOPIC_MAP_PREVIEW_SCENARIO === 'linear'
        ? [segment(1, 80, '最后一个问题：如果延期两周呢？', '建立安全库存，并准备可替代的供应商。', [threadInfo[0]])]
        : [
              root,
              segment(3, 6, '如果延期两周呢？', '建立安全库存，并准备可替代的供应商。', [threadInfo[0]], root.id),
              segment(
                  7,
                  8,
                  '另一个方案：先评估备用供应商。',
                  '可以从资质、样品质量和小批量交付三方面验证。',
                  [threadInfo[1]],
                  root.id
              )
          ]

const preferences = { ...base.state.preferences, mode: 'tree' }
export default {
    ...base,
    title: 'Conversation Map · message segments',
    hostContext: { ...base.hostContext, initialQuery: { parameters: preferences } },
    state: { ...base.state, preferences, queries: [] },
    async handleRequest(message, context) {
        const result = await base.handleRequest(message, context)
        if (message.type === 'requestData') {
            const parameters = message.query?.parameters ?? {}
            context.state.queries.push({ ...parameters, search: message.query?.search ?? '' })
            result.data.item.currentConversationId = conversation.conversationId
            if (
                parameters.representation === 'segments' &&
                parameters.conversationId &&
                !parameters.threadId &&
                !message.query?.search
            ) {
                result.data.item.nodes = segments
                result.data.item.total = segments.length
            }
        }
        return result
    }
}
