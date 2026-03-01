import { TChatOptions, TChatRequest } from '@metad/contracts'
import { defineAgentMessageType } from './message-type'

export const AGENT_CHAT_DISPATCH_MESSAGE_TYPE = defineAgentMessageType('chat_dispatch', 1)

export interface AgentChatCallbackTarget {
	messageType: string
	headers?: Record<string, string>
	context?: Record<string, unknown>
}

export interface AgentChatDispatchPayload extends Record<string, unknown> {
	request: TChatRequest
	options: TChatOptions
	callback: AgentChatCallbackTarget
}

export interface AgentChatCallbackEnvelopePayload extends Record<string, unknown> {
	kind: 'stream' | 'complete' | 'error'
	sourceMessageId: string
	sequence: number
	event?: unknown
	error?: string
	context?: Record<string, unknown>
}
