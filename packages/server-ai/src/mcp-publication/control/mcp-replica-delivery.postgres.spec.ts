// A shared reconciliation schedule must not suppress the original host's local cancellation observation.
import { mcpTestDatabase } from '../testing/database'
import { publisherHarness, until, gate } from '../testing/harness'
import { taskInput } from '../testing/fixtures'
import { parseTaskPayload } from '../mcp-task.helpers'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('MCP original host cancellation across competing reconcilers', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>
    let owner: ReturnType<typeof publisherHarness>, replica: ReturnType<typeof publisherHarness>
    beforeAll(async () => {
        database = await mcpTestDatabase(url)
    })
    afterAll(async () => {
        await database.close()
    })
    beforeEach(() => {
        owner = publisherHarness(database.db)
        replica = publisherHarness(database.db)
        // Drive the two independent timer schedules explicitly to reproduce replica starvation.
        owner.close()
        replica.close()
    })
    it('observes local termination even while another replica keeps advancing nextControlAt', async () => {
        const started = gate(),
            release = gate()
        let aborted = false
        owner.runtime.executeTool.mockImplementation(async (input) => {
            input.signal.addEventListener(
                'abort',
                () => {
                    aborted = true
                },
                { once: true }
            )
            started.release()
            await release.promise
            return { content: [] }
        })
        const created = await owner.service.create(taskInput())
        const task = await owner.store.read(created.taskId)
        const payload = parseTaskPayload(task.requestPayload)
        if (!payload) throw new Error('Missing persisted test task payload')
        const execution = owner.service.process({ ...payload, generation: task.control.generation })
        try {
            await started.promise
            await replica.service.cancel(taskInput().publication, taskInput().principal, task.taskId)
            // This is normal production behavior on the non-owning replica, not a fabricated database state.
            for (let tick = 0; tick < 3; tick++) {
                await replica.service.reconcileOne(await replica.store.read(task.taskId))
                await owner.service.reconcile()
            }
            expect(aborted).toBe(true)
            expect((await owner.store.read(task.taskId)).control.phase).toBe('running')
            expect(owner.runtime.executeTool).toHaveBeenCalledTimes(1)
        } finally {
            release.release()
            await execution
        }
        await until(async () => (await owner.store.read(task.taskId)).control.handlerExited)
    })
})
