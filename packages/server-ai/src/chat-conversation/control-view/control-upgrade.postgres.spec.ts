import { randomUUID } from 'node:crypto'
import { viewFixture } from './testing/view.test-fixture'
import { threadGraphRevision } from '../thread-graph-revision'
import { ChatConversationThread } from '../conversation-thread.entity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('thread control schema preflight during upgrades and rollback', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>
    beforeEach(async () => {
        f = await viewFixture(url)
    })
    afterEach(async () => {
        await f.close()
    })
    it('blocks new execution when a required migration is absent and never changes the current run', async () => {
        await f.db.query('ALTER TABLE chat_thread_control_projection RENAME COLUMN revision TO unavailable_revision')
        const read = () => f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })
        const before = await read()
        await expect(f.control.start(f.threadId, randomUUID())).rejects.toMatchObject({
            response: { errorCode: 'EXECUTION_CONTROL_UNAVAILABLE', reason: 'schema' }
        })
        expect((await read()).runControl).toEqual(before.runControl)
    })
    it.each(['id', 'createdAt', 'updatedAt', 'createdById', 'updatedById'])(
        'withholds execution when the inherited projection column %s is not migrated',
        async (column) => {
            await f.db.query(`ALTER TABLE chat_thread_control_projection RENAME COLUMN "${column}" TO unavailable_column`)
            const read = () => f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })
            const before = await read()
            await expect(f.control.start(f.threadId, randomUUID())).rejects.toMatchObject({
                response: { errorCode: 'EXECUTION_CONTROL_UNAVAILABLE', reason: 'schema' }
            })
            expect((await read()).runControl).toEqual(before.runControl)
            await f.db.query(`ALTER TABLE chat_thread_control_projection RENAME COLUMN unavailable_column TO "${column}"`)
            expect((await f.views.read(f.threadId)).controlView.state).toBe('running')
        }
    )
    it('preserves a paused checkpoint across a missing migration and resumes it once after restoration', async () => {
        const { result, checkpoint } = await f.pause()
        const resume = () =>
            f.control.claimResume(f.threadId, f.executionId, result.pauseId, threadGraphRevision(f.graph))
        await f.db.query('ALTER TABLE chat_thread_control_projection RENAME COLUMN revision TO unavailable_revision')
        await expect(resume()).rejects.toMatchObject({ response: { reason: 'schema' } })
        expect(
            (await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })).runControl.state
        ).toBe('paused')
        await f.db.query('ALTER TABLE chat_thread_control_projection RENAME COLUMN unavailable_revision TO revision')
        await expect(resume()).resolves.toEqual(checkpoint)
        await expect(resume()).rejects.toThrow()
    })
})
