import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { Logger } from '@nestjs/common'

type RecoverableMessage = BaseMessage & {
	role?: string
	tool_calls?: unknown[]
	invalid_tool_calls?: unknown[]
	tool_call_id?: string
	status?: 'success' | 'error'
	artifact?: unknown
	metadata?: Record<string, unknown>
	usage_metadata?: unknown
}

function toAIMessage(message: RecoverableMessage): AIMessage {
	const fields: ConstructorParameters<typeof AIMessage>[0] & {
		tool_calls?: unknown[]
		invalid_tool_calls?: unknown[]
		usage_metadata?: unknown
	} = {
		content: message.content,
		name: message.name,
		additional_kwargs: message.additional_kwargs,
		response_metadata: message.response_metadata,
		id: message.id
	}
	const mutableFields = fields as any

	if (message.tool_calls !== undefined) {
		mutableFields.tool_calls = message.tool_calls
	}
	if (message.invalid_tool_calls !== undefined) {
		mutableFields.invalid_tool_calls = message.invalid_tool_calls
	}
	if (message.usage_metadata !== undefined) {
		mutableFields.usage_metadata = message.usage_metadata
	}

	return new AIMessage(fields as ConstructorParameters<typeof AIMessage>[0])
}

function toToolMessage(message: RecoverableMessage): ToolMessage {
	const fields: {
		content: RecoverableMessage['content']
		name: RecoverableMessage['name']
		additional_kwargs: RecoverableMessage['additional_kwargs']
		response_metadata: RecoverableMessage['response_metadata']
		id: RecoverableMessage['id']
		tool_call_id: string
		status?: RecoverableMessage['status']
		artifact?: RecoverableMessage['artifact']
		metadata?: RecoverableMessage['metadata']
	} = {
		content: message.content,
		name: message.name,
		additional_kwargs: message.additional_kwargs,
		response_metadata: message.response_metadata,
		id: message.id,
		tool_call_id: message.tool_call_id as string
	}

	if (message.status !== undefined) {
		fields.status = message.status
	}
	if (message.artifact !== undefined) {
		fields.artifact = message.artifact
	}
	if (message.metadata !== undefined) {
		fields.metadata = message.metadata
	}

	return new ToolMessage(fields)
}

export function sanitizeMessagesForLLM(messages: BaseMessage[], logger?: Logger): BaseMessage[] {
	return messages.map((message, index) => {
		if (!message || typeof message._getType !== 'function') {
			logger?.warn(`Message at index ${index} is not a BaseMessage, converting to HumanMessage`)
			return new HumanMessage({ content: String((message as { content?: unknown } | undefined)?.content ?? '') })
		}

		const recoverableMessage = message as RecoverableMessage
		if (recoverableMessage._getType() === 'generic' && !recoverableMessage.role) {
			logger?.warn(
				`Message at index ${index} is a generic ChatMessage with empty role, inferring type from content/structure`
			)
			if (recoverableMessage.additional_kwargs?.tool_calls || recoverableMessage.tool_calls?.length) {
				return toAIMessage(recoverableMessage)
			}
			if (recoverableMessage.tool_call_id) {
				return toToolMessage(recoverableMessage)
			}
			return toAIMessage(recoverableMessage)
		}

		return message
	})
}
