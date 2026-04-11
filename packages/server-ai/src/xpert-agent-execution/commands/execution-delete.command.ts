import { IXpertAgentExecution } from '@xpert-ai/contracts'
import { FindOptionsWhere } from '@xpert-ai/server-core'
import { ICommand } from '@nestjs/cqrs'

export class XpertAgentExecutionDelCommand implements ICommand {
	static readonly type = '[Xpert Agent Execution] Delete'

	constructor(public readonly conditions: FindOptionsWhere<IXpertAgentExecution>) {}
}
