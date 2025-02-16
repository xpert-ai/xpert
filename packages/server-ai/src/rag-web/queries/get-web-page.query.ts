import { IQuery } from '@nestjs/cqrs'

export class GetRagWebDocCacheQuery implements IQuery {
	static readonly type = '[Rag Web] Get doc cache'

	constructor(public readonly id: string,) {}
}
