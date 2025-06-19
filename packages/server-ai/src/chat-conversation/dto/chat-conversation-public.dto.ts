import { IChatConversation, IProject, IUser, IXpert, IXpertAgentExecution } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertProjectIdentiDto } from '../../xpert-project/dto'
import { XpertIdentiDto } from '../../xpert/dto'

@Expose()
export class ChatConversationPublicDTO {

	@Expose()
	@Transform((params: TransformFnParams) => (params.value ? params.value : params.obj.parameters?.input))
	title?: string

	@Transform((params: TransformFnParams) => (params.value ? new UserPublicDTO(params.value) : null))
	createdBy?: IUser

	@Transform((params: TransformFnParams) => (params.value ? new XpertIdentiDto(params.value) : null))
	xpert?: IXpert

	@Transform((params: TransformFnParams) => (params.value ? new XpertProjectIdentiDto(params.value) : null))
	project?: IProject

	@Expose()
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentExecutionDTO(_)))
	executions?: IXpertAgentExecution[]

	constructor(partial: Partial<ChatConversationPublicDTO> | Partial<IChatConversation>) {
		Object.assign(this, partial)
	}
}
