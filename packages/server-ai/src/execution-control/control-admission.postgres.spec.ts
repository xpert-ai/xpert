import { requireControlSchema } from '@xpert-ai/server-core'
import { McpRemoteOperation } from '../mcp-consumer/execution/mcp-operation.entity'
import { mcpTestDatabase } from '../mcp-publication/testing/database'
import { mcpControlSchema } from './control-admission'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP admission requires the inherited operation schema', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    beforeEach(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
    })
    afterEach(async () => {
        if (database) await database.close()
    })
    it.each(['createdAt', 'updatedAt', 'createdById', 'updatedById', 'operationKey', 'nextControlAt'])(
        'rejects an unmigrated %s column and recovers after schema restoration',
        async (column) => {
            await expect(requireControlSchema(database.db.manager, mcpControlSchema)).resolves.toBeUndefined()
            await database.db.query(`ALTER TABLE mcp_remote_operation RENAME COLUMN "${column}" TO unavailable_column`)
            await expect(requireControlSchema(database.db.manager, mcpControlSchema)).rejects.toMatchObject({
                response: { errorCode: 'EXECUTION_CONTROL_UNAVAILABLE', reason: 'schema' }
            })
            await database.db.query(`ALTER TABLE mcp_remote_operation RENAME COLUMN unavailable_column TO "${column}"`)
            await expect(requireControlSchema(database.db.manager, mcpControlSchema)).resolves.toBeUndefined()
        }
    )
})
