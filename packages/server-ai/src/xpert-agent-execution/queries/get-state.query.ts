import { IQuery } from '@nestjs/cqrs'

export class XpertAgentExecutionStateQuery implements IQuery {
	static readonly type = '[Xpert Agent Execution] Get state'

	constructor(public readonly id: string) {}
}
