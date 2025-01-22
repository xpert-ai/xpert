import { IQuery } from '@nestjs/cqrs'

export class GetLarkClientQuery implements IQuery {
	static readonly type = '[Integration Lark] Get client'

	constructor(public readonly integrationId: string,) {}
}
