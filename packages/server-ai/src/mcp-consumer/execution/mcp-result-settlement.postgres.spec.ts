import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { until, gate } from '../../mcp-publication/testing/harness'
import { publication, principal, capability } from '../../mcp-publication/testing/fixtures'
import { toDetailedTask } from '../../mcp-publication/mcp-task.helpers'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { httpPair } from './testing/http-pair'
import { MCP_EXECUTION_CONTROL_EXTENSION_ID } from '@xpert-ai/contracts'
jest.setTimeout(30_000)
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP result and settlement snapshot', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>, pair: Awaited<ReturnType<typeof httpPair>>
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
    })
    beforeEach(async () => {
        await database.db.query(
            'TRUNCATE mcp_task,mcp_remote_operation,execution_task_control,execution_task_publication'
        )
        pair = await httpPair(database.db)
        jest.spyOn(pair.operations, 'reconcileOne').mockResolvedValue()
    })
    afterEach(async () => pair?.close())
    afterAll(async () => database?.close())
    const row = async () => (await database.db.getRepository(McpRemoteOperation).find())[0]

    it('never pairs an older working snapshot with a later settled receipt', async () => {
        const hold = gate()
        const controller = new AbortController()
        pair.publisher.runtime.executeTool.mockImplementation(async () => {
            await hold.promise
            return { content: [{ type: 'text', text: 'completed once' }] }
        })
        const waiting = pair.operations
            .execute(new ExecuteMcpOperationCommand({ ...pair.input, signal: controller.signal }))
            .catch(() => undefined)
        let processing: Promise<void> | undefined
        try {
            await until(async () => Boolean((await row())?.record.taskId))
            processing = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
            await until(() => pair.publisher.runtime.executeTool.mock.calls.length === 1)
            const evidence = pair.publisher.store.evidence.bind(pair.publisher.store)
            jest.spyOn(pair.publisher.store, 'evidence').mockImplementationOnce(async (task) => {
                hold.release()
                await processing
                return evidence(task)
            })
            const op = await row()
            const inspect = () =>
                pair.publisher.service.controlOperation(publication(), principal(), capability(), {
                    ...op.record.identity,
                    serverId: publication().id,
                    action: 'inspect'
                })
            const raced = await inspect()
            expect(raced.task.status).toBe('working')
            expect(raced.receipt.state).toBe('pending')
            expect(raced.task._meta).toEqual({ [MCP_EXECUTION_CONTROL_EXTENSION_ID]: raced.receipt })
            const completed = await inspect()
            expect(completed.task).toMatchObject({
                status: 'completed',
                result: { content: [{ type: 'text', text: 'completed once' }] }
            })
            expect(completed.receipt.state).toBe('settled')
            expect(pair.publisher.runtime.executeTool).toHaveBeenCalledTimes(1)
        } finally {
            hold.release()
            await processing
            controller.abort()
            await waiting
        }
    })

    it('keeps reading a running operation until the final task result is persisted', async () => {
        const controller = new AbortController()
        const waiting = pair.operations
            .execute(new ExecuteMcpOperationCommand({ ...pair.input, signal: controller.signal }))
            .catch(() => undefined)
        try {
            await until(async () => Boolean((await row())?.record.taskId))
            const op = await row()
            const before = await pair.publisher.store.read(op.record.taskId)
            await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
            const after = await pair.publisher.store.read(op.record.taskId)
            const receipt = await pair.publisher.store.evidence(after)
            const inconsistent = await pair.operationStore.update(op.id, op.generation, (current) => {
                current.record.task = toDetailedTask(before)
                current.record.receipt = receipt
            })
            await pair.operationStore.finalize(inconsistent)
            expect((await pair.operationStore.read(op.id)).record.phase).not.toBe('settled')
            const complete = await pair.operationStore.update(op.id, op.generation, (current) => {
                current.record.task = toDetailedTask(after)
            })
            await pair.operationStore.finalize(complete)
            expect((await pair.operationStore.read(op.id)).record.phase).toBe('settled')
            expect(await waiting).toEqual(after.resultRef)
            expect(pair.requests.filter((method) => method === 'tools/call')).toHaveLength(1)
        } finally {
            controller.abort()
            await waiting
        }
    })
})
