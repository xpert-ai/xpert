import { IUser, IXpert } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertPublicDTO } from '../../xpert/dto'
import { ChatConversation } from '../conversation.entity'

@Exclude()
export class ChatConversationSimpleDTO {
	@Expose()
	id: string

	@Expose()
	key: string

	@Expose()
	title?: string

	@Expose()
	updatedAt?: Date

	@Expose()
	createdAt?: Date

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	createdBy?: IUser

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	updatedBy?: IUser

	@Transform((params: TransformFnParams) => (params.value ? new XpertPublicDTO(params.value) : null))
	declare xpert?: IXpert

	constructor(partial: ChatConversation) {
		Object.assign(this, partial)
	}
}
