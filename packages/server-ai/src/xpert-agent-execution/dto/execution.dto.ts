import { StoredMessage } from '@langchain/core/messages'
import { IUser, IXpert, IXpertAgent, IXpertAgentExecution } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Expose, Transform } from 'class-transformer'
import { XpertAgentIdentiDto } from '../../xpert-agent/dto'
import { XpertIdentiDto } from '../../xpert/dto'

@Expose()
export class XpertAgentExecutionDTO {

    @Expose()
	tokens?: number

    @Expose()
    messages?: StoredMessage[]

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertAgentExecutionDTO(_)))
	subExecutions?: IXpertAgentExecution[]

	@Expose()
	@Transform(({ value }) => new UserPublicDTO(value))
	createdBy: IUser

	// Temporary properties
	@Expose()
	totalTokens?: number

	@Expose()
	summary?: string

	@Transform(({value}) => value ? new XpertAgentIdentiDto(value) : null)
	@Expose()
	agent?: IXpertAgent

	@Transform(({value}) => value ? new XpertIdentiDto(value) : null)
	@Expose()
	xpert?: IXpert

	constructor(partial: Partial<XpertAgentExecutionDTO>) {
		Object.assign(this, partial)
	}
}
