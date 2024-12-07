import { IXpert, IXpertAgentExecution } from '@metad/contracts'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertPublicDTO } from '../../xpert/dto'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'

@Expose()
export class ChatConversationPublicDTO {
	
	@Transform((params: TransformFnParams) => (params.value ? new XpertPublicDTO(params.value) : null))
	declare xpert?: IXpert

	@Expose()
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentExecutionDTO(_)))
	executions?: IXpertAgentExecution[]

	constructor(partial: Partial<ChatConversationPublicDTO>) {
		Object.assign(this, partial)
	}
}
