import { IXpertAgentExecution } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { FindAgentExecutionsQuery } from '../find.query'

@QueryHandler(FindAgentExecutionsQuery)
export class FindAgentExecutionsHandler implements IQueryHandler<FindAgentExecutionsQuery> {
	constructor(private readonly service: XpertAgentExecutionService) {}

	public async execute(command: FindAgentExecutionsQuery): Promise<{ items: IXpertAgentExecution[] }> {
		return await this.service.findAll(command.options)
	}
}
