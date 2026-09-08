import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { estimateContextContent, estimateContextMessages, estimateContextText, fitContextText } from './context-budget'

describe('context request estimation', () => {
    it('does not tokenize inline media transport bytes as text', () => {
        const remote = [{ type: 'image_url', image_url: { url: 'https://example.test/image' } }]
        const inline = [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + 'A'.repeat(400000) } }]
        expect(estimateContextContent(inline)).toBe(estimateContextContent(remote))
    })
    it('includes tool arguments and message overhead', () => {
        const message = new AIMessage({
            content: '',
            tool_calls: [{ name: 'write', id: '1', args: { text: 'x'.repeat(4000) } }]
        })
        expect(estimateContextMessages([message])).toBeGreaterThan(1000)
        expect(estimateContextMessages([new HumanMessage('test')])).toBe(5)
    })
    it('budgets Unicode conservatively and never keeps five oversized lines', () => {
        for (const text of ['你好吗'.repeat(100), '😀'.repeat(100), Array(5).fill('x'.repeat(10000)).join('\n')]) {
            for (const fromEnd of [true, false]) {
                const fitted = fitContextText(text, 50, fromEnd)
                expect(estimateContextText(fitted)).toBeLessThanOrEqual(50)
                expect(fitted).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/)
            }
        }
    })
    it('reserves space for media instead of counting an empty text conversion', () => {
        expect(
            estimateContextContent([{ type: 'image_url', image_url: { url: 'https://example.test/image' } }])
        ).toBeGreaterThanOrEqual(4096)
    })
})
