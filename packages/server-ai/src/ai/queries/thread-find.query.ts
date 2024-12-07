import { IQuery } from '@nestjs/cqrs'

export class FindThreadQuery implements IQuery {
	static readonly type = '[Agent Protocol] Find one thread'

	constructor(
		public readonly threadId: string,
		public readonly relations?: string[]
	) {}
}
