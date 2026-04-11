import { IStoryPoint } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

export class StoryPointOneQuery implements IQuery {
	static readonly type = '[StoryPoint] Query One'

	constructor(public id: string, public options?: Pick<FindManyOptions<IStoryPoint>, 'relations'>) {}
}
