import { StoredMessage } from '@langchain/core/messages'
import { IUser, IXpertAgentExecution } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Expose, Transform } from 'class-transformer'

@Expose()
export class XpertAgentExecutionDTO {

    @Expose()
	tokens?: number

    @Expose()
    messages?: StoredMessage[]

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertAgentExecutionDTO(_)))
	subExecutions?: IXpertAgentExecution[]

	// Temporary properties
	@Expose()
	totalTokens?: number

	@Expose()
	@Transform(({ value }) => new UserPublicDTO(value))
	createdBy: IUser

	constructor(partial: Partial<XpertAgentExecutionDTO>) {
		Object.assign(this, partial)
	}
}
