import { PaginationParams } from '@xpert-ai/server-core'
import { IQuery } from '@nestjs/cqrs'
import { XpertAgentExecution } from '../agent-execution.entity'

export class FindAgentExecutionsQuery implements IQuery {
	static readonly type = '[Xpert Agent Execution] Find all'

	constructor(
		public readonly options: Partial<PaginationParams<XpertAgentExecution>>,
	) {}
}
