import { IQuery } from '@nestjs/cqrs'

export class KnowledgebaseGetOneQuery implements IQuery {
	static readonly type = '[Knowledgebase] Get one'

	constructor(
		public readonly input: {
			id: string
		}
	) {}
}
