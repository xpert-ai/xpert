import {
	IChatConversation,
	IChatMessage,
	IChatMessageFeedback,
	TChatConversationOptions,
	TChatConversationStatus,
	TChatFrom,
	TSensitiveOperation
} from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class ConversationDTO {
	@Expose()
	id: string

	@Expose()
	threadId: string

	@Expose()
	title?: string

	@Expose()
	status?: TChatConversationStatus

	@Expose()
	from?: TChatFrom

	@Expose()
	fromEndUserId?: string

	@Expose()
	options?: TChatConversationOptions

	@Expose()
	error?: string

	@Expose()
	operation?: TSensitiveOperation

	@Expose()
	xpertId?: string

	@Expose()
	projectId?: string

	@Expose()
	taskId?: string

	@Expose()
	createdAt?: Date

	@Expose()
	updatedAt?: Date

	constructor(partial: Partial<IChatConversation>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class ChatMessageDTO {
	@Expose()
	id: string

	@Expose()
	conversationId?: string

	@Expose()
	role?: IChatMessage['role']

	@Expose()
	content?: IChatMessage['content']

	@Expose()
	reasoning?: IChatMessage['reasoning']

	@Expose()
	status?: IChatMessage['status']

	@Expose()
	error?: string

	@Expose()
	executionId?: string

	@Expose()
	createdAt?: Date

	@Expose()
	updatedAt?: Date

	constructor(partial: Partial<IChatMessage>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class ChatMessageFeedbackDTO {
	@Expose()
	id: string

	@Expose()
	conversationId?: string

	@Expose()
	messageId?: string

	@Expose()
	rating?: IChatMessageFeedback['rating']

	@Expose()
	content?: string

	@Expose()
	createdAt?: Date

	@Expose()
	updatedAt?: Date

	constructor(partial: Partial<IChatMessageFeedback>) {
		Object.assign(this, partial)
	}
}
