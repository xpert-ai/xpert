import { ITenant, TChatConversationStatus } from '@metad/contracts'

export const INTEGRATION_LARK = 'lark'
export const iconImage = `data:image/png;base64,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`

export type LarkMessage = {
	data: {
		receive_id: string
		content: string
		msg_type: 'text' | 'post' | 'image' | 'interactive'
		uuid?: string
	}
	params: {
		receive_id_type: 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id'
	}
}

export type ChatLarkContext<T = any> = {
	tenant: ITenant
	organizationId: string
	integrationId: string
	userId: string
	chatId?: string
	chatType?: 'p2p' | 'group' | string
	/**
	 * Lark platform sender's open_id (for @mention and private message)
	 */
	senderOpenId?: string
	message?: T
	input?: string
	abortSignal?: AbortSignal
	runtimeRunId?: string
	runtimeSessionKey?: string
}

export type TLarkEvent = {
	schema: '2.0'
	event_id: string
	token: string
	create_time: string
	event_type: 'im.message.receive_v1'
	tenant_key: string
	app_id: string
	message: {
		chat_id: string
		chat_type: string
		content: string
		create_time: string
		message_id: string
		message_type: 'text' | 'image'
		update_time: string
		mentions?: {
			id: {
				open_id: string
				union_id: string
				user_id: string
			}
			key: string
			name: string
			tenant_key: string
		}[]
	}
	sender: {
		sender_id: {
			open_id: string
			union_id: string
			user_id: string
		}
		sender_type: 'user'
		tenant_key: string
	}
}

export const LARK_END_CONVERSATION = 'lark-end-conversation'
export const LARK_CONFIRM = 'lark-confirm'
export const LARK_REJECT = 'lark-reject'
export type TLarkConversationStatus = TChatConversationStatus | 'end'

export function isEndAction(value: string) {
	return value === `"${LARK_END_CONVERSATION}"` || value === LARK_END_CONVERSATION
}

export function isConfirmAction(value: string) {
	return value === `"${LARK_CONFIRM}"` || value === LARK_CONFIRM
}

export function isRejectAction(value: string) {
	return value === `"${LARK_REJECT}"` || value === LARK_REJECT
}

export function isConversationAction(value: string) {
	return isEndAction(value) || isConfirmAction(value) || isRejectAction(value)
}
