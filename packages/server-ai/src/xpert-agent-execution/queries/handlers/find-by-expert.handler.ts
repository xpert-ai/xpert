import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { FindExecutionsByXpertQuery } from '../find-by-expert.query'

@QueryHandler(FindExecutionsByXpertQuery)
export class FindExecutionsByXpertHandler implements IQueryHandler<FindExecutionsByXpertQuery> {
	constructor(private readonly service: XpertAgentExecutionService) {}

	public async execute(command: FindExecutionsByXpertQuery): Promise<{ items: IXpertAgentExecution[] }> {
		const { xpertId, paginationParams } = command

		return await this.service.findAll({ ...paginationParams, where: { xpertId, agentKey: IsNull() } })
	}
}
