import { IQuery } from '@nestjs/cqrs'

export class DataSourceStrategyQuery implements IQuery {
    static readonly type = '[DataSource] strategy'

    constructor(
        public readonly name: string,
        public readonly options: {
            [key: string]: any
        },
    ) {}
}
