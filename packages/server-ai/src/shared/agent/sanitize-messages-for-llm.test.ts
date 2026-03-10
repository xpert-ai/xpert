import { AIMessage, ChatMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { sanitizeMessagesForLLM } from './sanitize-messages-for-llm'

describe('sanitizeMessagesForLLM', () => {
	it('preserves inferred tool calls when recovering an assistant message', () => {
		const message = new ChatMessage({
			content: 'Call the weather tool',
			role: '',
			additional_kwargs: {},
			id: 'msg-ai'
		}) as ChatMessage & { tool_calls: Array<{ id: string; name: string; args: { city: string } }> }
		message.tool_calls = [
			{
				id: 'tool-1',
				name: 'weather',
				args: { city: 'Shanghai' }
			}
		]

		const [sanitized] = sanitizeMessagesForLLM([message])

		expect(sanitized).toBeInstanceOf(AIMessage)
		expect((sanitized as AIMessage).tool_calls).toEqual(message.tool_calls)
	})

	it('recovers tool messages without dropping the tool call id', () => {
		const message = new ChatMessage({
			content: 'Tool result',
			role: '',
			additional_kwargs: {},
			id: 'msg-tool'
		}) as ChatMessage & { tool_call_id: string; status: 'success' | 'error'; artifact: { raw: string } }
		message.tool_call_id = 'tool-1'
		message.status = 'success'
		message.artifact = { raw: 'ok' }

		const [sanitized] = sanitizeMessagesForLLM([message])

		expect(sanitized).toBeInstanceOf(ToolMessage)
		expect((sanitized as ToolMessage).tool_call_id).toBe('tool-1')
		expect((sanitized as ToolMessage).artifact).toEqual({ raw: 'ok' })
		expect((sanitized as ToolMessage).status).toBe('success')
	})

	it('converts malformed non-message inputs to HumanMessage', () => {
		const [sanitized] = sanitizeMessagesForLLM([{ content: 'fallback' } as HumanMessage])

		expect(sanitized).toBeInstanceOf(HumanMessage)
		expect((sanitized as HumanMessage).content).toBe('fallback')
	})
})
