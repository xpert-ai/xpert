import { IQuery } from '@nestjs/cqrs'

export class GetRagWebOptionsQuery implements IQuery {
	static readonly type = '[Rag Web] Get options'

	constructor(public readonly type: string,) {}
}
