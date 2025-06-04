import { IQuery } from '@nestjs/cqrs'

export class DimensionMemberServiceQuery implements IQuery {
	static readonly type = '[Dimension Member] Get Service'

	constructor() {}
}
