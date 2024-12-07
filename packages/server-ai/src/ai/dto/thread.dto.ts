import { IChatConversation, IUser, TChatConversationStatus } from '@metad/contracts'
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
	key: string

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
	metadata: Partial<IChatConversation>

	@Expose()
	values: Record<string, any>;

	constructor(partial: ChatConversation, values?: any) {
		Object.assign(this, partial)

		this.metadata = pick(partial, 'id', 'title', 'xpertId')
		this.values = values
	}
}
