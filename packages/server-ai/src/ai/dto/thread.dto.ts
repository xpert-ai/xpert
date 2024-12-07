import { IUser, TChatConversationStatus } from '@metad/contracts'
import { pick } from '@metad/server-common'
import { UserPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { ChatConversation } from '../../core/entities/internal'

@Exclude()
export class ThreadDTO {
	id: string

	@Expose({
		name: 'thread_id'
	})
	threadId: string

	@Expose()
	status: TChatConversationStatus

	@Expose({
		name: 'updated_at'
	})
	updatedAt?: Date

	@Expose({
		name: 'created_at'
	})
	createdAt?: Date

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose({
		name: 'created_by'
	})
	createdBy?: IUser

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose({
		name: 'updated_by'
	})
	updatedBy?: IUser

	@Expose()
	metadata: Record<string, unknown>

	@Expose()
	values: Record<string, unknown>;

	constructor(partial: ChatConversation, values?: Record<string, unknown>) {
		Object.assign(this, partial)

		this.metadata = {...pick(partial, 'id', 'title'), assistant_id: partial.xpertId}
		this.values = values
	}
}
