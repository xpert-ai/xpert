import { randomUUID } from 'node:crypto'
import { withTaskControl } from '@xpert-ai/server-core'
import { MCP_EXECUTION_CONTROL_EXTENSION_ID } from '@xpert-ai/contracts'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { gate, until } from '../../mcp-publication/testing/harness'
import { publication } from '../../mcp-publication/testing/fixtures'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { httpPair } from './testing/http-pair'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP control failure and ownership boundaries', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    let pair: Awaited<ReturnType<typeof httpPair>>
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
        await pair.close()
        jest.restoreAllMocks()
    })
    afterAll(async () => database.close())
    const rows = () => database.db.getRepository(McpRemoteOperation).find()
    const root = () =>
        pair.publisher.controls.register({
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            kind: 'execution',
            resourceId: randomUUID()
        })
    const start = (input = pair.input) => pair.operations.execute(new ExecuteMcpOperationCommand(input))

    it.each(['detached', 'shared'] as const)(
        'keeps %s work and its result alive after the parent terminates',
        async (policy) => {
            const parent = await root()
            await pair.publisher.controls.claim(parent.id)
            const waiting = withTaskControl({ version: 2, targetId: parent.id }, () =>
                pair.operations.execute(new ExecuteMcpOperationCommand({ ...pair.input, policy }))
            ).catch(() => undefined)
            await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
            await pair.publisher.controls.change(parent.id, 'terminated')
            const [op] = await rows()
            expect(await pair.publisher.controls.desired(op.targetId)).toBe('running')
            await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
            await until(async () => {
                await pair.operations.reconcileOne(op)
                return (await pair.operationStore.read(op.id)).record.phase === 'settled'
            })
            await waiting
            expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
            expect(pair.requests.filter((x) => x === 'tasks/cancel')).toHaveLength(0)
        }
    )

    it('rejects a changed live connection before reserving or sending business input', async () => {
        await expect(start({ ...pair.input, connectionVersion: 'b'.repeat(64) })).rejects.toThrow()
        expect(await rows()).toHaveLength(0)
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(0)
    })

    it('holds a third-party cancellation acknowledgement without exit evidence', async () => {
        const describe = pair.consumer.connection.describeServer.bind(pair.consumer.connection)
        jest.spyOn(pair.consumer.connection, 'describeServer').mockImplementation(async (server) => {
            const original = await describe(server)
            return { ...original, capabilities: { tools: {}, extensions: { 'io.modelcontextprotocol/tasks': {} } } }
        })
        pair.transport.terminate = async (row) => {
            await pair.consumer.tasks.cancel(row.record.taskId, 'fixture')
            return undefined
        }
        const waiting = start().catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        await until(async () => Boolean((await rows())[0].record.taskId))
        const [op] = await rows()
        await pair.publisher.controls.change(op.targetId, 'terminated')
        await until(async () => {
            await pair.operations.reconcileOne(op)
            return pair.requests.includes('tasks/cancel')
        })
        await waiting
        expect((await pair.operationStore.read(op.id)).record.phase).not.toBe('settled')
        expect((await pair.publisher.controls.read(op.targetId)).state).toBe('running')
    })

    it('retains an original receipt through a database failure and never resends tools/call', async () => {
        let fail = true
        const update = pair.operationStore.update.bind(pair.operationStore)
        jest.spyOn(pair.operationStore, 'update').mockImplementation((id, generation, change) =>
            update(id, generation, async (value, tx) => {
                await change(value, tx)
                if (fail && value.record.phase === 'observing' && value.record.hostExited) {
                    fail = false
                    throw new Error('injected commit failure')
                }
            })
        )
        const waiting = start()
        await until(() => !fail)
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
        await pair.operations.reconcile()
        const [op] = await rows()
        await pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        await until(async () => {
            await pair.operations.reconcileOne(op)
            return (await pair.operationStore.read(op.id)).record.phase === 'settled'
        })
        await waiting
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })

    it('rejects a stale generation receipt instead of accepting it as exit evidence', async () => {
        const waiting = start().catch(() => undefined)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const [old] = await rows()
        await until(async () => Boolean((await pair.operationStore.read(old.id)).record.taskId))
        const original = pair.transport.terminate.bind(pair.transport)
        pair.transport.terminate = async (row) => ({ ...(await original(row)), generation: randomUUID() })
        await pair.publisher.controls.change(old.targetId, 'terminated')
        // Validation belongs at the transport boundary; a mismatched protocol response is rejected there.
        const request = pair.consumer.connection.requestExtension.bind(pair.consumer.connection)
        jest.spyOn(pair.consumer.connection, 'requestExtension').mockImplementation(
            async (server, message, schema, options) => {
                const response = await request(server, message, schema, options)
                if (
                    message.method === 'xpert/tasks/control' &&
                    'receipt' in response &&
                    typeof response.receipt === 'object' &&
                    response.receipt !== null
                )
                    Reflect.set(response.receipt, 'generation', randomUUID())
                return response
            }
        )
        await until(async () => {
            try {
                await pair.operations.reconcileOne(old)
                return false
            } catch {
                return true
            }
        })
        expect((await pair.operationStore.read(old.id)).record.phase).not.toBe('settled')
        await waiting
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })

    it('resumes an interrupted input waiter against the same remote handler', async () => {
        let writes = 0,
            prompts = 0
        pair.publisher.runtime.executeTool.mockImplementation(async (request) => {
            writes++
            await request.host.input.request({
                type: 'form',
                title: 'approve',
                schema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] }
            })
            return { content: [] }
        })
        const input = async () => {
            prompts++
            if (prompts === 1) throw new Error('graph checkpoint interruption')
            return { action: 'accept' as const, content: { approved: true } }
        }
        const parent = await root()
        await pair.publisher.controls.claim(parent.id)
        const call = () =>
            withTaskControl({ version: 2, targetId: parent.id }, () =>
                pair.operations.execute(new ExecuteMcpOperationCommand({ ...pair.input, input }))
            )
        const interrupted = call().catch((error) => error)
        await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
        const run = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
        const [op] = await rows()
        await until(async () => {
            await pair.operations.reconcileOne(op)
            return prompts === 1
        })
        expect(await interrupted).toBeInstanceOf(Error)
        const resumed = call()
        await until(async () => {
            await pair.operations.reconcileOne(op)
            return (await pair.operationStore.read(op.id)).record.phase === 'settled'
        })
        await run
        await resumed
        expect(writes).toBe(1)
        expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
    })
})
