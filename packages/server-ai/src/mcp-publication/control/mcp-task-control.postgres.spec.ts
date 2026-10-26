import { randomUUID } from 'node:crypto'
import { currentTaskControl, TaskControlRejected, withTaskControl } from '@xpert-ai/server-core'
import { McpOperationIdentity } from '@xpert-ai/contracts'
import { mcpTestDatabase } from '../testing/database'
import { publisherHarness, gate, until } from '../testing/harness'
import { taskInput, publication, principal, capability } from '../testing/fixtures'
import { hashJson } from '../mcp-task.helpers'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP publication durable admission and settlement', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    let a: ReturnType<typeof publisherHarness>, b: ReturnType<typeof publisherHarness>
    beforeAll(async () => {
        database = await mcpTestDatabase(url)
    })
    beforeEach(async () => {
        await database.db.query('TRUNCATE mcp_task,execution_task_control,execution_task_publication')
        a = publisherHarness(database.db)
        b = publisherHarness(database.db)
    })
    afterEach(() => {
        a.close()
        b.close()
    })
    afterAll(async () => database?.close())
    const read = (id: string) => a.service.get(publication(), principal(), id)
    function identity(): McpOperationIdentity {
        return {
            version: 1,
            operationId: randomUUID(),
            generation: randomUUID(),
            inputHash: hashJson({ value: 'original' }),
            toolName: capability().publicName
        }
    }

    it('persists cancellation before queue failure and retains the original handler until it returns', async () => {
        const hold = gate()
        a.runtime.executeTool.mockImplementation(async () => {
            await hold.promise
            return { content: [] }
        })
        const created = await a.service.create(taskInput())
        const processing = a.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        await until(() => a.runtime.executeTool.mock.calls.length === 1)
        b.queue.cancel.mockRejectedValue(new Error('queue down'))
        await b.service.cancel(publication(), principal(), created.taskId)
        expect((await read(created.taskId)).status).toBe('working')
        const row = await a.store.read(created.taskId)
        expect(await a.controls.desired(row.control.targetId)).toBe('terminated')
        expect(row.control.handlerExited).toBe(false)
        await a.service.reconcile()
        expect(a.runtime.executeTool.mock.calls[0][0].signal.aborted).toBe(true)
        console.log(
            'AFTER_CANCEL_PENDING',
            JSON.stringify({
                status: (await read(created.taskId)).status,
                handlerExited: false,
                executions: a.runtime.executeTool.mock.calls.length
            })
        )
        hold.release()
        await processing
        expect((await read(created.taskId)).status).toBe('cancelled')
        await a.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        expect(a.runtime.executeTool).toHaveBeenCalledTimes(1)
    })

    it('admits exactly one handler for twelve concurrent deliveries', async () => {
        const hold = gate()
        a.runtime.executeTool.mockImplementation(async () => {
            await hold.promise
            return { content: [] }
        })
        b.runtime.executeTool.mockImplementation(a.runtime.executeTool)
        const created = await a.service.create(taskInput()),
            payload = a.queue.enqueue.mock.calls[0][0].payload
        const work = Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).service.process(payload)))
        await until(() => a.runtime.executeTool.mock.calls.length > 0)
        hold.release()
        await work
        expect(a.runtime.executeTool).toHaveBeenCalledTimes(1)
        expect((await read(created.taskId)).status).toBe('completed')
        console.log(
            'AFTER_CONCURRENT_CLAIM',
            JSON.stringify({ deliveries: 12, executions: a.runtime.executeTool.mock.calls.length })
        )
    })

    it('continues a live input request once without replaying its preceding write', async () => {
        let writes = 0
        a.runtime.executeTool.mockImplementation(async (request) => {
            writes++
            const value = await request.host.input.request({
                type: 'form',
                title: 'Approve',
                schema: { type: 'object' }
            })
            return { structuredContent: { value } }
        })
        const created = await a.service.create(taskInput()),
            payload = a.queue.enqueue.mock.calls[0][0].payload
        const work = a.service.process(payload)
        await until(async () => (await read(created.taskId)).status === 'input_required')
        const requests = (await read(created.taskId)).inputRequests
        const key = Object.keys(requests as object)[0]
        await Promise.all(
            Array.from({ length: 8 }, () =>
                b.service.update(publication(), principal(), created.taskId, {
                    [key]: { action: 'accept', content: { approved: true } }
                })
            )
        )
        await work
        expect(writes).toBe(1)
        expect(a.queue.enqueue).toHaveBeenCalledTimes(1)
        expect((await read(created.taskId)).status).toBe('completed')
        console.log(
            'AFTER_INPUT_CONTINUATION',
            JSON.stringify({
                writes,
                executions: a.runtime.executeTool.mock.calls.length,
                queueSubmissions: a.queue.enqueue.mock.calls.length
            })
        )
    })

    it('seals an operation before a delayed create arrives and rejects another generation', async () => {
        const operation = identity()
        const stopped = await b.service.controlOperation(publication(), principal(), capability(), {
            ...operation,
            serverId: publication().id,
            action: 'terminate'
        })
        expect(stopped.receipt).toMatchObject({ state: 'settled', handlerExited: true, intent: 'terminated' })
        const delayed = await a.service.create({ ...taskInput(), operation })
        expect(delayed.taskId).toBe(stopped.receipt.taskId)
        expect(delayed.status).toBe('cancelled')
        expect(a.queue.enqueue).not.toHaveBeenCalled()
        await expect(
            a.service.create({ ...taskInput(), operation: { ...operation, generation: randomUUID() } })
        ).rejects.toThrow()
        console.log(
            'AFTER_HANDLE_BARRIER',
            JSON.stringify({ status: delayed.status, executions: a.runtime.executeTool.mock.calls.length })
        )
    })

    it('requires attached descendants to settle and leaves detached/shared roots running', async () => {
        const hold = gate(),
            children: string[] = []
        a.runtime.executeTool.mockImplementation(async () => {
            for (const policy of ['attached', 'detached', 'shared'] as const) {
                const child = await a.controls.register({
                    tenantId: publication().tenantId,
                    organizationId: publication().organizationId,
                    kind: 'sandbox-callback',
                    resourceId: policy,
                    parent: currentTaskControl(),
                    policy,
                    drainOnPause: true
                })
                await a.controls.claim(child.id)
                children.push(child.id)
            }
            await hold.promise
            return { content: [] }
        })
        const created = await a.service.create(taskInput())
        const work = a.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        await until(() => children.length === 3)
        await b.service.cancel(publication(), principal(), created.taskId)
        hold.release()
        await work
        expect((await read(created.taskId)).status).toBe('working')
        expect(await a.controls.desired(children[0])).toBe('terminated')
        for (const id of children.slice(1)) expect(await a.controls.desired(id)).toBe('running')
        await a.controls.receipt(children[0], 'completed')
        expect((await read(created.taskId)).status).toBe('cancelled')
    })

    it('drains a necessary child through parent pause without abort or replay', async () => {
        const entered = gate(),
            proceed = gate()
        let childId: string
        a.runtime.executeTool.mockImplementation(async () => {
            entered.release()
            await proceed.promise
            const child = await a.controls.register({
                tenantId: publication().tenantId,
                organizationId: publication().organizationId,
                kind: 'sandbox-callback',
                resourceId: 'necessary',
                parent: currentTaskControl(),
                drainOnPause: true
            })
            childId = child.id
            const claim = await a.controls.claim(child.id)
            await a.controls.finishClaim(child.id, claim, 'succeeded')
            return { content: [] }
        })
        const created = await a.service.create(taskInput())
        const work = a.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        await entered.promise
        const row = await a.store.read(created.taskId)
        await a.controls.change(row.control.targetId, 'paused')
        await b.service.reconcile()
        expect(a.runtime.executeTool.mock.calls[0][0].signal.aborted).toBe(false)
        proceed.release()
        await work
        expect((await a.controls.read(childId)).state).toBe('completed')
        await a.controls.change(row.control.targetId, 'running')
        await b.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        expect(b.runtime.executeTool).not.toHaveBeenCalled()
        expect((await read(created.taskId)).status).toBe('completed')
    })

    it('retains a claim after original-host loss instead of replaying', async () => {
        const created = await a.service.create(taskInput()),
            row = await a.store.read(created.taskId)
        await a.store.claim(row)
        await b.service.process(a.queue.enqueue.mock.calls[0][0].payload)
        await b.service.cancel(publication(), principal(), created.taskId)
        expect((await read(created.taskId)).status).toBe('working')
        expect(b.runtime.executeTool).not.toHaveBeenCalled()
        await expect(b.store.update(created.taskId, randomUUID(), () => undefined)).rejects.toThrow()
    })

    it('does not let an old operation stop a new task', async () => {
        const old = identity(),
            next = identity()
        const oldTask = await a.service.create({ ...taskInput(), operation: old })
        const nextTask = await a.service.create({ ...taskInput(), operation: next })
        await b.service.controlOperation(publication(), principal(), capability(), {
            ...old,
            serverId: publication().id,
            action: 'terminate'
        })
        expect((await read(oldTask.taskId)).status).toBe('cancelled')
        expect((await read(nextTask.taskId)).status).toBe('working')
    })
})
