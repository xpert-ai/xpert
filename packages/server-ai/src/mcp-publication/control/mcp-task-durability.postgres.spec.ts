import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mcpTestDatabase } from '../testing/database'
import { publisherHarness, until } from '../testing/harness'
import { taskInput, publication, principal } from '../testing/fixtures'
import { McpRemoteOperation } from '../../mcp-consumer/execution/mcp-operation.entity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP durable publisher recovery boundaries', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    let publisher: ReturnType<typeof publisherHarness>
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [McpRemoteOperation])
    })
    beforeEach(async () => {
        await database.db.query('TRUNCATE mcp_task, execution_task_control, execution_task_publication')
        publisher = publisherHarness(database.db)
    })
    afterEach(() => publisher.close())
    afterAll(async () => database.close())
    it('publishes from a durable reservation after queue recovery', async () => {
        publisher.queue.enqueue.mockRejectedValueOnce(new Error('queue unavailable'))
        const created = await publisher.service.create(taskInput())
        expect((await publisher.store.read(created.taskId)).control.published).toBe(false)
        await until(async () => {
            await publisher.service.reconcile()
            return (await publisher.store.read(created.taskId)).control.published
        })
        await publisher.service.process(publisher.queue.enqueue.mock.calls[1][0].payload)
        expect(publisher.runtime.executeTool).toHaveBeenCalledTimes(1)
    })
    it('ignores edited delivery arguments and executes only the authorized stored payload', async () => {
        await publisher.service.create(taskInput())
        const delivered = publisher.queue.enqueue.mock.calls[0][0].payload
        await publisher.service.process({ ...delivered, arguments: { value: 'injected' } })
        expect(publisher.runtime.executeTool).toHaveBeenCalledWith(
            expect.objectContaining({ arguments: { value: 'original' } })
        )
    })
    it('persists the actual exit after a database outage without entering the handler again', async () => {
        const created = await publisher.service.create(taskInput())
        const update = publisher.store.update.bind(publisher.store)
        let fail = true
        jest.spyOn(publisher.store, 'update').mockImplementation((id, generation, change) =>
            update(id, generation, async (task, tx) => {
                await change(task, tx)
                if (fail && task.control.handlerExited) {
                    fail = false
                    throw new Error('receipt commit unavailable')
                }
            })
        )
        const payload = publisher.queue.enqueue.mock.calls[0][0].payload
        await publisher.service.process(payload)
        expect((await publisher.store.read(created.taskId)).control.handlerExited).toBe(false)
        await publisher.service.process(payload)
        await until(async () => {
            await publisher.service.reconcile()
            return (await publisher.store.read(created.taskId)).control.phase === 'settled'
        })
        expect(publisher.runtime.executeTool).toHaveBeenCalledTimes(1)
    })
    it('does not interpret legacy status as evidence or rerun an unregistered record', async () => {
        const created = await publisher.service.create(taskInput())
        const payload = publisher.queue.enqueue.mock.calls[0][0].payload
        await database.db.query('UPDATE mcp_task SET control=NULL,"nextControlAt"=NULL')
        await publisher.service.process(payload)
        expect(publisher.runtime.executeTool).not.toHaveBeenCalled()
        expect(await publisher.store.evidence(await publisher.store.read(created.taskId))).toBeUndefined()
        await expect(publisher.service.cancel(publication(), principal(), created.taskId)).rejects.toThrow()
    })
    it('applies the migration twice and preserves legacy rows without manufactured receipts', async () => {
        const created = await publisher.service.create(taskInput())
        await database.db.query('ALTER TABLE mcp_task DROP COLUMN control, DROP COLUMN "nextControlAt"')
        await database.db.query('DROP TABLE mcp_remote_operation')
        const migration = readFileSync(
            resolve(__dirname, '../../mcp-consumer/execution/migrations/20261024-mcp-execution-control.sql'),
            'utf8'
        )
        await database.db.query(migration)
        await database.db.query(migration)
        expect((await publisher.store.read(created.taskId)).control).toBeNull()
        expect(await database.db.getRepository(McpRemoteOperation).count()).toBe(0)
    })
})
