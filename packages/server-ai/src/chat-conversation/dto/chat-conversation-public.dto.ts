import { IUser, IXpert, IXpertAgentExecution } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertPublicDTO } from '../../xpert/dto'

@Expose()
export class ChatConversationPublicDTO {
	@Transform((params: TransformFnParams) => (params.value ? new UserPublicDTO(params.value) : null))
	createdBy?: IUser

	@Transform((params: TransformFnParams) => (params.value ? new XpertPublicDTO(params.value) : null))
	declare xpert?: IXpert

	@Expose()
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentExecutionDTO(_)))
	executions?: IXpertAgentExecution[]

	constructor(partial: Partial<ChatConversationPublicDTO>) {
		Object.assign(this, partial)
	}
}
