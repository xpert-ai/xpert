jest.mock('@xpert-ai/server-core', () => ({
    DataSource: class DataSource {},
    DataSourceService: class DataSourceService {},
    DataSourceStrategyQuery: class DataSourceStrategyQuery {
        constructor(
            public readonly name: string,
            public readonly options: object,
            public readonly dataSourceId?: string
        ) {}
    }
}))

import { DataSource, DataSourceService, DataSourceStrategyQuery } from '@xpert-ai/server-core'
import { DBQueryRunner } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import { XpertDatabaseAdapterQuery } from '../get-database-adapter.query'
import { XpertDatabaseAdapterQueryHandler } from './xpert-database-adapter.handler'

describe('XpertDatabaseAdapterQueryHandler', () => {
    it('resolves a data source runner through the server-core strategy query', async () => {
        const dataSourceService = Object.create(DataSourceService.prototype) as DataSourceService
        dataSourceService.findOneByIdString = jest.fn().mockResolvedValue(
            Object.assign(new DataSource(), {
                id: 'data-source-1',
                type: { type: 'postgres', protocol: 'sql' },
                options: { host: 'localhost' }
            })
        )
        const runner = Object.create(null) as DBQueryRunner
        const queryBus = Object.create(QueryBus.prototype) as QueryBus
        queryBus.execute = jest.fn().mockResolvedValue(runner)
        const handler = new XpertDatabaseAdapterQueryHandler(dataSourceService, queryBus)

        await expect(handler.execute(new XpertDatabaseAdapterQuery({ id: 'data-source-1' }))).resolves.toBe(runner)
        expect(dataSourceService.findOneByIdString).toHaveBeenCalledWith('data-source-1', {
            relations: ['type']
        })
        const strategyQuery = (queryBus.execute as jest.Mock).mock.calls[0][0] as DataSourceStrategyQuery
        expect(strategyQuery).toMatchObject({
            name: 'postgres',
            options: { host: 'localhost' },
            dataSourceId: 'data-source-1'
        })
    })
})
