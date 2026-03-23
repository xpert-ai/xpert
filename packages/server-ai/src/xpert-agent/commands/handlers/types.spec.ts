import { AIMessage } from '@langchain/core/messages'
import { createThreadContextUsageEvent, getAIMessageTokenUsage } from './types'

describe('thread context usage helpers', () => {
	it('creates realtime usage event from llmOutput.tokenUsage', () => {
		const message = new AIMessage({
			content: 'Hello'
		}) as AIMessage & {
			llmOutput?: {
				tokenUsage: {
					promptTokens: number
					completionTokens: number
					totalTokens: number
				}
			}
		}
		message.llmOutput = {
			tokenUsage: {
				promptTokens: 120,
				completionTokens: 30,
				totalTokens: 150
			}
		}

		const event = createThreadContextUsageEvent({
			threadId: 'thread-1',
			runId: 'run-1',
			agentKey: 'agent-1',
			message,
			updatedAt: '2026-03-12T00:00:00.000Z',
			execution: {
				tokens: 200,
				embedTokens: 8,
				totalPrice: 1.25,
				currency: 'USD'
			}
		})

		expect(event).toEqual({
			type: 'thread_context_usage',
			threadId: 'thread-1',
			runId: 'run-1',
			agentKey: 'agent-1',
			updatedAt: '2026-03-12T00:00:00.000Z',
			usage: {
				contextTokens: 120,
				inputTokens: 120,
				outputTokens: 30,
				totalTokens: 200,
				embedTokens: 8,
				totalPrice: 1.25,
				currency: 'USD'
			}
		})
	})

	it('falls back to usage_metadata when llmOutput token usage is missing', () => {
		const message = new AIMessage({
			content: 'Hello'
		})
		message.usage_metadata = {
			input_tokens: 50,
			output_tokens: 10,
			total_tokens: 60
		}

		expect(getAIMessageTokenUsage(message)).toEqual({
			promptTokens: 50,
			completionTokens: 10,
			totalTokens: 60
		})
	})

	it('returns null when message has no usable token usage', () => {
		expect(
			createThreadContextUsageEvent({
				threadId: 'thread-1',
				runId: 'run-1',
				agentKey: 'agent-1',
				message: new AIMessage({ content: 'Hello' })
			})
		).toBeNull()
	})
})
