import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { MessagesAnnotation } from '@langchain/langgraph'
import {
	ChatMessageEventTypeEnum,
	IXpertAgent,
	IXpertAgentExecution,
	TThreadContextUsageEvent,
	TTokenUsage
} from '@metad/contracts'
import { AfterModelHandler } from '@xpert-ai/plugin-sdk'
import { AIMessage, BaseMessage, isAIMessage } from '@langchain/core/messages'

export function createThreadContextUsageEventHook(
	agent: IXpertAgent,
	thread_id: string,
	execution: Partial<IXpertAgentExecution>
) {
	const agentKey = agent.key
	return {
		key: `${agent.key}_thread_context_usage_after_model`,
		hook: (async (state) => {
			const lastMessage = state.messages?.[state.messages.length - 1]
			const payload = createThreadContextUsageEvent({
				threadId: thread_id,
				runId: execution.id,
				agentKey,
				message: lastMessage,
				execution,
				updatedAt: new Date()
			})

			if (payload) {
				await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, payload)
			}
		}) as AfterModelHandler<typeof MessagesAnnotation.State, any>
	}
}

export function getAIMessageTokenUsage(message: unknown): TTokenUsage | null {
	if (!message || typeof message !== 'object' || !('_getType' in message) || !isAIMessage(message as BaseMessage)) {
		return null
	}

	const llmOutput = (message as AIMessage & { llmOutput?: Record<string, any> }).llmOutput
	const usage = llmOutput?.tokenUsage ?? llmOutput?.estimatedTokenUsage
	if (usage) {
		return normalizeTokenUsage(usage)
	}

	const usageMetadata = (message as AIMessage).usage_metadata
	if (usageMetadata) {
		return normalizeTokenUsage({
			promptTokens: usageMetadata.input_tokens,
			completionTokens: usageMetadata.output_tokens,
			totalTokens: usageMetadata.total_tokens
		})
	}

	return null
}

export function createThreadContextUsageEvent(params: {
	threadId: string
	runId?: string | null
	agentKey: string
	execution?: Partial<IXpertAgentExecution> | null
	message: unknown
	updatedAt?: string | Date
}): TThreadContextUsageEvent | null {
	const tokenUsage = getAIMessageTokenUsage(params.message)
	if (!tokenUsage) {
		return null
	}

	const totalTokens = toFiniteNumber(tokenUsage.totalTokens || tokenUsage.promptTokens + tokenUsage.completionTokens)

	return {
		type: 'thread_context_usage',
		threadId: params.threadId,
		runId: params.runId ?? null,
		agentKey: params.agentKey,
		updatedAt: toIsoString(params.updatedAt),
		usage: {
			contextTokens: tokenUsage.promptTokens,
			inputTokens: tokenUsage.promptTokens,
			outputTokens: tokenUsage.completionTokens,
			totalTokens,
			embedTokens: toFiniteNumber(params.execution?.embedTokens),
			totalPrice: toFiniteNumber(params.execution?.totalPrice),
			currency: params.execution?.currency ?? null
		}
	}
}

function normalizeTokenUsage(usage: Partial<TTokenUsage> | null | undefined): TTokenUsage | null {
	if (!usage) {
		return null
	}

	const promptTokens = toFiniteNumber(usage.promptTokens)
	const completionTokens = toFiniteNumber(usage.completionTokens)
	const totalTokens = toFiniteNumber(usage.totalTokens, promptTokens + completionTokens)

	if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0) {
		return null
	}

	return {
		promptTokens,
		completionTokens,
		totalTokens
	}
}

function toFiniteNumber(value: unknown, fallback = 0): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value
	}
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value)
		if (Number.isFinite(parsed)) {
			return parsed
		}
	}
	return fallback
}

function toIsoString(value?: string | Date) {
	if (value instanceof Date) {
		return value.toISOString()
	}
	if (typeof value === 'string') {
		const date = new Date(value)
		if (!Number.isNaN(date.getTime())) {
			return date.toISOString()
		}
	}
	return new Date().toISOString()
}
