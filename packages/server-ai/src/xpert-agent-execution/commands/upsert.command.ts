import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertAgentExecutionUpsertCommand implements ICommand {
	static readonly type = '[Xpert Agent Execution] Upsert'

	constructor(public readonly execution: Partial<IXpertAgentExecution>) {}
}
