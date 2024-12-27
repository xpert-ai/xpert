import { ITenant, IUser, IIntegration, TChatConversationStatus } from "@metad/contracts"
import { LarkService } from "./lark.service"

export type LarkMessage = {
	data: {
		receive_id: string
		content: string
		msg_type: 'text' | 'image' | 'interactive'
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
	integration: IIntegration
	user: IUser
	larkService: LarkService
	chatId?: string
	chatType?: 'p2p' | 'group' | string
	message?: T
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