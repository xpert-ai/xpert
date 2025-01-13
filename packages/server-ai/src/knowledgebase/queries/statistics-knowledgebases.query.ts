import { IQuery } from '@nestjs/cqrs'

export class StatisticsKnowledgebasesQuery implements IQuery {
	static readonly type = '[Knowledgebase] Statistics total knowledgebases in organization'

	constructor(
		public readonly start?: string,
        public readonly end?: string,
	) {}
}
