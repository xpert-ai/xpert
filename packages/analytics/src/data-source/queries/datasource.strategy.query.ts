import { Query } from '@nestjs/cqrs'
import { AdapterBaseOptions, DBQueryRunner } from '@xpert-ai/plugin-sdk'

/**
 * Create database adapter by name of data source type and options:
 * First search for the type in the plugins, then search for it in the adapter package.
 */
export class DataSourceStrategyQuery extends Query<DBQueryRunner> {
    static readonly type = '[DataSource] strategy'

    constructor(
        public readonly name: string,
        public readonly options: AdapterBaseOptions
    ) {
        super()
    }
}
