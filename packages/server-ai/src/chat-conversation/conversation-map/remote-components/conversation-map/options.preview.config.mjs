import base from './growth.preview.config.mjs'

const id = (prefix, index) => `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const projects = [
    { value: base.state.preferences.projectId, label: '采购优化' },
    ...Array.from({ length: 42 }, (_, i) => ({
        value: id('6', i + 1),
        label: `采购项目 ${String(i + 1).padStart(2, '0')}`
    }))
]
const conversations = [
    { value: base.state.conversation.conversationId, label: base.state.conversation.title },
    ...Array.from({ length: 42 }, (_, i) => ({
        value: id('7', i + 1),
        label: `历史对话 ${String(i + 1).padStart(2, '0')}`
    }))
]

export default {
    ...base,
    title: 'Conversation Map · searchable selectors',
    state: { ...base.state, optionQueries: [], optionFailures: 0 },
    async handleRequest(message, context) {
        const query = message.query?.parameters
        if (message.type === 'requestData' && query?.operation === 'options') {
            context.state.optionQueries.push(query)
            if (query.search === 'retry' && context.state.optionFailures++ === 0)
                throw Error('Preview: retry this request')
            if (query.search === 'slow') await new Promise((resolve) => setTimeout(resolve, 800))
            const source = query.kind === 'projects' ? projects : query.projectId === null ? [] : conversations
            const matching = ['slow', 'retry'].includes(query.search)
                ? [{ value: source[0]?.value ?? 'none', label: query.search }]
                : source.filter((option) => option.label.includes(query.search ?? ''))
            const options = matching.slice(query.offset, query.offset + query.limit)
            return {
                data: {
                    item: {
                        options,
                        nextOffset:
                            query.offset + options.length < matching.length ? query.offset + options.length : null
                    }
                }
            }
        }
        const result = await base.handleRequest(message, context)
        if (message.type === 'requestData' && query?.operation === 'trail') {
            const choice = conversations.find((item) => item.value === query.conversationId)
            result.data.item = {
                ...result.data.item,
                conversationId: query.conversationId,
                title: choice?.label ?? result.data.item.title
            }
        }
        return result
    }
}
