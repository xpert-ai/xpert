import { randomUUID } from 'node:crypto'
import { withTaskControl } from '@xpert-ai/server-core'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { gate as createGate, until } from '../../mcp-publication/testing/harness'
import { publication, principal } from '../../mcp-publication/testing/fixtures'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { McpOperationStore } from './mcp-operation.store'
import { McpOperationService } from './mcp-operation.service'
import { httpPair } from './testing/http-pair'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP dual-ended HTTP and PostgreSQL control', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    let pair: Awaited<ReturnType<typeof httpPair>>
    const extras: McpOperationService[] = []
    const gates: ReturnType<typeof createGate>[] = []
    const gate = () => {
        const value = createGate()
        gates.push(value)
        return value
    }
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
    })
    beforeEach(async () => {
        await database.db.query(
            'TRUNCATE mcp_task, mcp_remote_operation, execution_task_control, execution_task_publication'
        )
        pair = await httpPair(database.db)
    })
    afterEach(async () => {
        for (const g of gates.splice(0)) g.release()
        for (const extra of extras.splice(0)) extra.onModuleDestroy()
        await pair?.close()
    })
    afterAll(async () => database?.close())
    const row = async () => (await database.db.getRepository(McpRemoteOperation).find())[0]
    const settle = async () => {
        await until(async () => {
            await pair.publisher.service.reconcile()
            await pair.operations.reconcileOne(await row())
            return (await row()).record.phase === 'settled'
        })
    }
    const start = () => pair.operations.execute(new ExecuteMcpOperationCommand(pair.input))

    it('persists and redelivers termination after two lost controls without an early terminal', async () => {
        const finish = gate()
        pair.publisher.runtime.executeTool.mockImplementation(async () => {
            await finish.promise
            return { content: [] }
        })
        const waiting = start().catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const running = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await until(() => pair.publisher.runtime.executeTool.mock.calls.length === 1)
        const op = await row()
        await pair.publisher.controls.change(op.targetId, 'terminated')
        pair.faults.failControl = 2
        await until(async () => {
            await pair.operations.reconcileOne(op).catch(() => undefined)
            return Boolean((await row()).record.receipt?.intent === 'terminated')
        })
        expect((await row()).record.receipt).toMatchObject({ state: 'pending', handlerExited: false })
        expect(await pair.publisher.controls.desired(op.targetId)).toBe('terminated')
        console.log(
            'AFTER_CONSUMER_REDELIVERY',
            JSON.stringify({
                controlAttempts: pair.requests.filter((x) => x === 'xpert/tasks/control').length,
                toolsCall: pair.requests.filter((x) => x === 'tools/call').length,
                receipt: (await row()).record.receipt.state
            })
        )
        finish.release()
        await running
        await settle()
        await waiting
        expect((await row()).record.phase).toBe('settled')
        expect(pair.publisher.runtime.executeTool).toHaveBeenCalledTimes(1)
    })

    it('recovers the operation without a returned handle and never starts it twice after replica restart', async () => {
        pair.faults.loseStartReply = true
        const wait = start().catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        await until(async () => (await row()).record.hostExited)
        const op = await row()
        await pair.publisher.controls.change(op.targetId, 'terminated')
        pair.operations.onModuleDestroy()
        const replica = new McpOperationService(
            new McpOperationStore(database.db.getRepository(McpRemoteOperation), pair.publisher.controls),
            pair.transport
        )
        extras.push(replica)
        await until(async () => {
            await replica.reconcileOne(op)
            return (await row()).record.receipt?.intent === 'terminated'
        })
        await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await replica.reconcileOne(op)
        await wait
        expect((await row()).record).toMatchObject({ phase: 'settled', receipt: { state: 'settled' } })
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
        expect(pair.publisher.runtime.executeTool).not.toHaveBeenCalled()
        console.log(
            'AFTER_LOST_HANDLE',
            JSON.stringify({ toolsCall: 1, executions: 0, phase: (await row()).record.phase })
        )
    })

    it('reuses a stable call under twelve concurrent callers and performs one input continuation', async () => {
        let writes = 0
        pair.publisher.runtime.executeTool.mockImplementation(async (request) => {
            writes++
            await request.host.input.request({
                type: 'form',
                title: 'Continue',
                schema: { type: 'object', properties: { confirmed: { type: 'boolean' } }, required: ['confirmed'] }
            })
            return { content: [{ type: 'text', text: 'done' }] }
        })
        const input = jest.fn(async () => ({ action: 'accept' as const, content: { confirmed: true } }))
        const root = await pair.publisher.controls.register({
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            kind: 'execution',
            resourceId: randomUUID()
        })
        await pair.publisher.controls.claim(root.id)
        const waits = withTaskControl({ version: 2, targetId: root.id }, () =>
            Array.from({ length: 12 }, () =>
                pair.operations.execute(new ExecuteMcpOperationCommand({ ...pair.input, input }))
            )
        )
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const run = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await until(async () =>
            Boolean(
                (await pair.publisher.store.read(pair.publisher.queue.enqueue.mock.calls[0][0].payload.taskId))
                    .inputRequests
            )
        )
        await until(async () => {
            await pair.operations.reconcileOne(await row())
            return input.mock.calls.length === 1
        })
        await until(async () => Object.keys((await row()).record.inputResponses).length === 1)
        await pair.operations.reconcileOne(await row())
        await run
        await settle()
        await Promise.all(waits)
        expect(writes).toBe(1)
        expect(input).toHaveBeenCalledTimes(1)
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
        console.log(
            'AFTER_CONCURRENT_INPUT',
            JSON.stringify({ callers: 12, toolsCall: 1, writes, prompts: input.mock.calls.length })
        )
    })

    it('drains admitted child work during parent pause then resumes by observing the same result', async () => {
        const root = await pair.publisher.controls.register({
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            kind: 'execution',
            resourceId: randomUUID()
        })
        await pair.publisher.controls.claim(root.id)
        const wait = withTaskControl({ version: 2, targetId: root.id }, () => start())
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        await pair.publisher.controls.change(root.id, 'paused')
        await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await settle()
        await wait
        expect(await pair.publisher.controls.settled(root.id, true)).toBe(true)
        await pair.publisher.controls.change(root.id, 'running')
        await withTaskControl({ version: 2, targetId: root.id }, () => start())
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })

    it('rejects old input after termination and does not resume the previous generation', async () => {
        const inputGate = gate()
        const finish = gate()
        const input = jest.fn(async () => {
            await inputGate.promise
            return { action: 'accept' as const, content: { confirmed: true } }
        })
        pair.publisher.runtime.executeTool.mockImplementation(async (request) => {
            await request.host.input.request({
                type: 'form',
                title: 'Continue',
                schema: { type: 'object', properties: { confirmed: { type: 'boolean' } } }
            })
            await finish.promise
            return { content: [] }
        })
        const wait = pair.operations
            .execute(new ExecuteMcpOperationCommand({ ...pair.input, input }))
            .catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const run = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await until(async () =>
            Boolean(
                (await pair.publisher.store.read(pair.publisher.queue.enqueue.mock.calls[0][0].payload.taskId))
                    .inputRequests
            )
        )
        await pair.operations.reconcileOne(await row())
        await until(() => input.mock.calls.length === 1)
        const op = await row()
        await pair.publisher.controls.change(op.targetId, 'terminated')
        inputGate.release()
        await wait
        expect((await row()).record.inputResponses).toEqual({})
        await pair.operations.reconcileOne(op)
        finish.release()
        await run
        await settle()
        await expect(pair.publisher.controls.change(op.targetId, 'running')).rejects.toThrow()
        expect(pair.publisher.runtime.executeTool).toHaveBeenCalledTimes(1)
    })

    it('accepts a directly completed reply to tools/call without inventing or repeating a task', async () => {
        pair.faults.directResult = true
        const result = await start()
        await settle()
        expect(result).toMatchObject({ content: [{ text: 'direct' }] })
        expect((await row()).record).toMatchObject({ callReturned: true, phase: 'settled' })
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })
})
