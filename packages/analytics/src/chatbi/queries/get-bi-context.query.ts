import { IQuery } from '@nestjs/cqrs'

/**
 */
export class GetBIContextQuery implements IQuery {
	static readonly type = '[ChatBI] Get BI Context'

	constructor() {}
}
