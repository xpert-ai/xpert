import { Query } from '@nestjs/cqrs'
import { AdapterBaseOptions, DBQueryRunner } from '@xpert-ai/plugin-sdk'

/**
 * Create a database query runner from the registered data source plugin.
 */
export class DataSourceStrategyQuery extends Query<DBQueryRunner> {
	static readonly type = '[DataSource] strategy'

	constructor(
		public readonly name: string,
		public readonly options: AdapterBaseOptions,
		public readonly dataSourceId?: string
	) {
		super()
	}
}
