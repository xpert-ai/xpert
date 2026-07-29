jest.mock('@xpert-ai/server-core', () => ({
    DataSource: class DataSource {},
    DataSourceService: class DataSourceService {}
}))

import { DataSource, DataSourceService } from '@xpert-ai/server-core'
import { XpertDatabasesQuery } from '../get-databases.query'
import { XpertDatabasesQueryHandler } from './xpert-databases.handler'

describe('XpertDatabasesQueryHandler', () => {
    it('returns only data sources matching the requested protocol', async () => {
        const dataSourceService = Object.create(DataSourceService.prototype) as DataSourceService
        dataSourceService.findMyAll = jest.fn().mockResolvedValue({
            items: [
                Object.assign(new DataSource(), {
                    id: 'sql-source',
                    name: 'SQL source',
                    type: { type: 'postgres', protocol: 'sql' }
                }),
                Object.assign(new DataSource(), {
                    id: 'xmla-source',
                    name: 'XMLA source',
                    type: { type: 'xmla', protocol: 'xmla' }
                })
            ],
            total: 2
        })
        const handler = new XpertDatabasesQueryHandler(dataSourceService)

        await expect(handler.execute(new XpertDatabasesQuery({ protocol: 'sql' }))).resolves.toEqual([
            {
                id: 'sql-source',
                name: 'SQL source',
                type: 'postgres',
                protocol: 'sql'
            }
        ])
    })
})
