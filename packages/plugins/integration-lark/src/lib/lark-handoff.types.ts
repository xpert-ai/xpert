import { ChatLarkMessageFields } from './chat/message'
import { ChatLarkContext } from './types'

export type ChatLarkContextPayload = Omit<
	ChatLarkContext,
	'abortSignal' | 'runtimeRunId' | 'runtimeSessionKey'
>

export interface SerializedLarkMessage {
	context: ChatLarkContextPayload
	fields: Partial<ChatLarkMessageFields> & {
		text?: string
	}
}

export interface LarkHandoffTaskBase {
	kind: 'message' | 'xpert'
	tenantId: string
	integrationId: string
	accountId: string
	accountKey: string
	sessionKey: string
	organizationId: string
	language?: string
	user: any
}

export interface LarkHandoffMessageTask extends LarkHandoffTaskBase {
	kind: 'message'
	payload: ChatLarkContextPayload
}

export interface LarkHandoffXpertTask extends LarkHandoffTaskBase {
	kind: 'xpert'
	xpertId: string
	input: string | null
	larkMessage: SerializedLarkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
	}
}

export type LarkHandoffTask = LarkHandoffMessageTask | LarkHandoffXpertTask
