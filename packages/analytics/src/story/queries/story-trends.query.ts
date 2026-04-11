import { IStory } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

export class StoryTrendsQuery implements IQuery {
	static readonly type = '[Story] Query Trends'

	constructor(
		public searchText: string,
		public options: Partial<FindManyOptions<IStory>>,
		public orderType: 'visits' | 'update') {}
}
