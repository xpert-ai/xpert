import { randomUUID } from 'node:crypto'
import { MCP_EXECUTION_CONTROL_METHOD } from '@xpert-ai/contracts'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { until } from '../../mcp-publication/testing/harness'
import { publication, principal, capability } from '../../mcp-publication/testing/fixtures'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { controlMeta, requestMcpControl } from './mcp-control.client'
import { httpPair } from './testing/http-pair'
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP execution control protocol boundaries', () => {
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
    it('rejects unnegotiated, misrouted, cross-generation and injected-parent controls over HTTP', async () => {
        const waiting = pair.operations.execute(new ExecuteMcpOperationCommand(pair.input)).catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const [row] = await database.db.getRepository(McpRemoteOperation).find()
        const params = {
            ...row.record.identity,
            serverId: row.record.serverId,
            action: 'terminate',
            _meta: controlMeta()
        }
        const headers = {
            'content-type': 'application/json',
            'mcp-protocol-version': '2026-07-28',
            'mcp-method': MCP_EXECUTION_CONTROL_METHOD,
            'mcp-name': row.id
        }
        const invalid = [
            { ...params, _meta: {} },
            { ...params, generation: randomUUID() },
            { ...params, serverId: randomUUID() },
            { ...params, inputHash: 'f'.repeat(64) },
            { ...params, parent: { targetId: randomUUID() } },
            { ...params, version: 2 }
        ]
        for (const input of invalid) {
            const response = await fetch(pair.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: randomUUID(),
                    method: MCP_EXECUTION_CONTROL_METHOD,
                    params: input
                })
            })
            expect(await response.json()).toEqual(expect.objectContaining({ error: expect.any(Object) }))
        }
        const wrongRoute = await fetch(pair.endpoint, {
            method: 'POST',
            headers: { ...headers, 'mcp-name': randomUUID() },
            body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: MCP_EXECUTION_CONTROL_METHOD, params })
        })
        expect(await wrongRoute.json()).toEqual(expect.objectContaining({ error: expect.any(Object) }))
        const task = await pair.publisher.store.read(pair.publisher.queue.enqueue.mock.calls[0][0].payload.taskId)
        expect(await pair.publisher.controls.desired(task.control.targetId)).toBe('running')
        const foreign = { ...principal(), subjectId: randomUUID() }
        await expect(pair.publisher.service.get(publication(), foreign, task.taskId)).rejects.toThrow()
        await expect(pair.publisher.service.cancel(publication(), foreign, task.taskId)).rejects.toThrow()
        expect(await pair.publisher.controls.desired(task.control.targetId)).toBe('running')
        await pair.publisher.controls.change(row.targetId, 'terminated')
        await requestMcpControl(pair.consumer, row, 'terminate')
        await waiting
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })
    it('does not return business results through the stop-only control response', async () => {
        const waiting = pair.operations.execute(new ExecuteMcpOperationCommand(pair.input))
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await waiting
        const [row] = await database.db.getRepository(McpRemoteOperation).find()
        const response = await pair.publisher.service.controlOperation(publication(), principal(), capability(), {
            ...row.record.identity,
            serverId: publication().id,
            action: 'terminate'
        })
        expect(response).not.toHaveProperty('task')
        expect(response).toHaveProperty('receipt.state', 'settled')
    })
})
