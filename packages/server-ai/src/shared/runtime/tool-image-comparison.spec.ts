import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { recentImageMessages } from './tool-image-messages'

const round = (id: string, name = 'view') => [
    new AIMessage({ content: '', tool_calls: [{ id, name, args: {} }] }),
    new ToolMessage({ content: id, name, tool_call_id: id })
]

describe('recent comparison image selection', () => {
    it('finds earlier complete image rounds across intervening file reads', () => {
        const messages = [...round('a'), ...round('read', 'read_file'), ...round('b')]
        expect(recentImageMessages(messages, ['view']).map((message) => message.tool_call_id)).toEqual(['a'])
    })
    it('does not reuse another user turn or incomplete image rounds', () => {
        expect(recentImageMessages([...round('a'), new HumanMessage('New work'), ...round('b')], ['view'])).toEqual([])
        const incomplete = [
            ...round('a'),
            new ToolMessage({ content: 'orphan', name: 'view', tool_call_id: 'orphan' }),
            ...round('b')
        ]
        expect(recentImageMessages(incomplete, ['view'])).toEqual([])
    })
    it('bounds lookup and returns latest comparison images first', () => {
        const messages = Array.from({ length: 20 }, (_, index) => round(String(index))).flat()
        const selected = recentImageMessages(messages, ['view']).map((message) => message.tool_call_id)
        expect(selected).toEqual(['18', '17', '16', '15', '14', '13'])
    })
})
