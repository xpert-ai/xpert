import { IXpertAgentExecution } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

export class XpertAgentExecutionDelCommand implements ICommand {
	static readonly type = '[Xpert Agent Execution] Delete'

	constructor(public readonly conditions: FindConditions<IXpertAgentExecution>) {}
}
