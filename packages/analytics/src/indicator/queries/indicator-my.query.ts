import { IIndicator } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

/**
 * 查询属于自己的指标: 自己创建和有权限编辑的
 */
export class IndicatorMyQuery implements IQuery {
	static readonly type = '[Indicator] My'

	constructor(public readonly options: Pick<FindManyOptions<IIndicator>, 'relations'> & Pick<FindManyOptions<IIndicator>, 'where'> ) {}
}
