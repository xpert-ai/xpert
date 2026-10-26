import { QueryBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { User } from '@xpert-ai/server-core'
import { MCPServerType, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { until } from '../../mcp-publication/testing/harness'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { ToolRuntimeService } from '../../tool-runtime'
import { McpClientConnectionService } from '../runtime/mcp-client-connection.service'
import { mcpConnectionVersion } from '../runtime/mcp-connection-version'
import { McpOperationTransport } from './mcp-operation.transport'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { httpPair } from './testing/http-pair'

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP stop-only reconnection uses the original HTTP endpoint', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>, pair: Awaited<ReturnType<typeof httpPair>>
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
    })
    beforeEach(async () => {
        await database.db.query(
            'TRUNCATE mcp_task,mcp_remote_operation,execution_task_control,execution_task_publication'
        )
        pair = await httpPair(database.db)
    })
    afterEach(async () => pair.close())
    afterAll(async () => database.close())

    it('stops through a fresh real HTTP client after business access is revoked, without loading unrelated stdio', async () => {
        const scope = pair.scope
        const toolset = Object.assign(new XpertToolset(), {
            id: scope.toolsetId,
            tenantId: scope.actor.tenantId,
            organizationId: scope.actor.organizationId,
            workspaceId: scope.workspaceId,
            category: XpertToolsetCategoryEnum.MCP,
            name: 'fixture',
            tools: [],
            schema: JSON.stringify({
                servers: {
                    fixture: { type: MCPServerType.HTTP, url: pair.endpoint },
                    unrelated: { type: MCPServerType.STDIO, command: 'must-never-run' }
                }
            })
        })
        const version = mcpConnectionVersion(toolset)
        pair.transport.prepare = async () => ({ scope, connectionVersion: version, reconnectable: true })
        const waiting = pair.operations
            .execute(new ExecuteMcpOperationCommand({ ...pair.input, connectionVersion: version }))
            .catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const [row] = await database.db.getRepository(McpRemoteOperation).find()
        const repo = Object.assign(Object.create(Repository.prototype) as Repository<XpertToolset>, {
            findOne: jest.fn(async () => toolset),
            findOneOrFail: jest.fn(async () => toolset)
        })
        const users = Object.assign(Object.create(Repository.prototype) as Repository<User>, {
            findOne: jest.fn(async () =>
                Object.assign(new User(), { id: scope.actor.userId, tenantId: scope.actor.tenantId })
            )
        })
        const workspaces = Object.assign(
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            {
                assertCanRead: jest.fn(async () => {
                    throw new Error('access revoked')
                })
            }
        )
        const connections = new McpClientConnectionService(
            Object.create(ToolRuntimeService.prototype) as ToolRuntimeService,
            workspaces,
            repo
        )
        const transport = new McpOperationTransport(
            connections,
            repo,
            users,
            Object.create(QueryBus.prototype) as QueryBus
        )
        await expect(transport.assertOriginal(row)).rejects.toThrow('access revoked')
        await pair.publisher.controls.change(row.targetId, 'terminated')
        let receipt = await transport.terminate(row)
        await until(async () => {
            receipt = await transport.terminate(row)
            return receipt.state === 'settled'
        })
        expect(receipt).toMatchObject({
            operationId: row.id,
            generation: row.generation,
            intent: 'terminated',
            state: 'settled'
        })
        expect(repo.findOneOrFail).toHaveBeenCalledWith(expect.objectContaining({ relations: ['tools'] }))
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
        expect(pair.publisher.runtime.executeTool).not.toHaveBeenCalled()
        expect(pair.requests.filter((x) => x === 'server/discover').length).toBeGreaterThan(1)
        // A changed saved endpoint cannot receive the old generation's control.
        toolset.schema = JSON.stringify({
            servers: { fixture: { type: MCPServerType.HTTP, url: 'http://127.0.0.1:1' } }
        })
        await expect(transport.terminate(row)).rejects.toThrow()
        await waiting
    })
})
