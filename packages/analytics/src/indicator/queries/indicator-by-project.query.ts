import { IIndicator } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

/**
 * Query indicators by project or created by me when project is null
 */
export class IndicatorsByProjectQuery implements IQuery {
	static readonly type = '[Indicator] get by project'

	constructor(public readonly projectId: string,
		public readonly options: Pick<FindManyOptions<IIndicator>, 'relations'> & Pick<FindManyOptions<IIndicator>, 'where'> ) {}
}
