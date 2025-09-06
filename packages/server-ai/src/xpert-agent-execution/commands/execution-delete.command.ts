import { IXpertAgentExecution } from '@metad/contracts'
import { FindOptionsWhere } from '@metad/server-core'
import { ICommand } from '@nestjs/cqrs'

export class XpertAgentExecutionDelCommand implements ICommand {
	static readonly type = '[Xpert Agent Execution] Delete'

	constructor(public readonly conditions: FindOptionsWhere<IXpertAgentExecution>) {}
}
