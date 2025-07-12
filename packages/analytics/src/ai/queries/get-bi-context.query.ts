import { IQuery } from '@nestjs/cqrs'

/**
 */
export class GetBIContextQuery implements IQuery {
	static readonly type = '[AiBi] Get BI Context'

	constructor(public readonly models?: string[]) {}
}
