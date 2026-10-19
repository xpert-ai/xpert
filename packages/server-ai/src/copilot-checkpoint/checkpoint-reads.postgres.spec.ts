import { randomUUID } from 'node:crypto'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointService } from './copilot-checkpoint.service'
import { GetCopilotCheckpointsByParentQuery } from './queries/get-by-parent.query'
import { GetCopilotCheckpointsByParentHandler } from './queries/handlers/get-by-parent.handler'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { CopilotCheckpointWritesService } from './writes/writes.service'
import {
    checkpointTestDatabaseUrl,
    createCheckpointPostgresFixture,
    expectCheckpointIdProjection,
    withCheckpointScope
} from './testing/checkpoint-postgres.fixture'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
const postgres = checkpointTestDatabaseUrl ? describe : describe.skip

postgres('checkpoint ID reads / PostgreSQL', () => {
    const fixture = createCheckpointPostgresFixture()
    const { database, checkpointSelects } = fixture
    const tenantId = randomUUID()
    const organizationId = randomUUID()
    const otherTenantId = randomUUID()
    let control: ThreadRunControlService
    let parent: GetCopilotCheckpointsByParentHandler
    let threadId: string
    let executionId: string

    beforeAll(async () => {
        await fixture.initialize()
        await fixture.tenant(tenantId)
        await fixture.tenant(otherTenantId)
        control = new ThreadRunControlService(database.getRepository(ChatConversationThread), database)
        parent = new GetCopilotCheckpointsByParentHandler(
            new CopilotCheckpointService(
                database.getRepository(CopilotCheckpoint),
                new CopilotCheckpointWritesService(database.getRepository(CopilotCheckpointWrites))
            )
        )
    }, 20000)
    afterAll(async () => {
        control?.onModuleDestroy()
        await fixture.close()
    })
    beforeEach(() => {
        threadId = randomUUID()
        executionId = randomUUID()
        checkpointSelects.length = 0
    })

    async function checkpoint(overrides: Partial<CopilotCheckpoint> = {}) {
        await database.getRepository(CopilotCheckpoint).insert({
            id: randomUUID(),
            tenantId,
            organizationId,
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: 'saved',
            parent_id: 'parent',
            checkpoint: Buffer.alloc(1024 * 1024, 0x61),
            metadata: Buffer.alloc(256 * 1024, 0x62),
            ...overrides
        })
    }

    async function pause(checkpointNs = '') {
        await database.getRepository(ChatConversationThread).insert({
            id: randomUUID(),
            tenantId,
            organizationId,
            threadId,
            status: 'busy',
            runControl: { state: 'running', executionId, graphRevision: 'revision' }
        })
        const request = await control.requestPause(threadId, executionId)
        const reference = { threadId, checkpointNs, checkpointId: 'saved' }
        await control.stageCheckpoint(threadId, executionId, reference)
        await control.finish(threadId, executionId, 'interrupted')
        return { pauseId: request.pauseId, reference }
    }

    it.each(['', 'agent:child'])(
        'resumes a stored checkpoint without fetching its blobs in namespace "%s"',
        async (checkpointNs) => {
            await checkpoint({ checkpoint_ns: checkpointNs })
            const { pauseId, reference } = await pause(checkpointNs)
            checkpointSelects.length = 0

            await expect(control.claimResume(threadId, executionId, pauseId, 'revision')).resolves.toEqual(reference)

            expect(await control.get(threadId)).toMatchObject({ state: 'running', checkpoint: reference })
            expectCheckpointIdProjection(checkpointSelects)
        }
    )

    it.each(['missing', 'tenantId', 'organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id'] as const)(
        'keeps the pause intact when the checkpoint differs by %s',
        async (mismatch) => {
            if (mismatch !== 'missing') {
                await checkpoint({ [mismatch]: mismatch === 'tenantId' ? otherTenantId : randomUUID() })
            }
            const { pauseId, reference } = await pause()
            checkpointSelects.length = 0

            await expect(control.claimResume(threadId, executionId, pauseId, 'revision')).rejects.toThrow(
                'The saved checkpoint is unavailable.'
            )

            expect(await control.get(threadId)).toMatchObject({ state: 'paused', pauseId, checkpoint: reference })
            expectCheckpointIdProjection(checkpointSelects)
        }
    )

    it('allows only one competing resume to claim the locked thread', async () => {
        await checkpoint()
        const { pauseId } = await pause()
        const other = new ThreadRunControlService(database.getRepository(ChatConversationThread), database)
        checkpointSelects.length = 0
        try {
            const results = await Promise.allSettled([
                control.claimResume(threadId, executionId, pauseId, 'revision'),
                other.claimResume(threadId, executionId, pauseId, 'revision')
            ])
            expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected'])
            const rejected = results.find((result) => result.status === 'rejected')
            if (rejected?.status !== 'rejected') throw new Error('Expected one rejected resume')
            expect(rejected.reason.message).toBe('This pause is no longer available to resume.')
            expect(await other.get(threadId)).toMatchObject({ state: 'running', executionId })
            expectCheckpointIdProjection(checkpointSelects)
        } finally {
            other.onModuleDestroy()
        }
    })

    function children(checkpointNs = '', currentOrganizationId: string | null = organizationId) {
        return withCheckpointScope(tenantId, currentOrganizationId, () =>
            parent.execute(
                new GetCopilotCheckpointsByParentQuery({
                    thread_id: threadId,
                    checkpoint_ns: checkpointNs,
                    checkpoint_id: 'parent'
                })
            )
        )
    }

    it.each(['', 'agent:child'])(
        'returns only scoped child IDs from PostgreSQL in namespace "%s"',
        async (checkpointNs) => {
            await checkpoint({ checkpoint_ns: checkpointNs, checkpoint_id: 'child-a' })
            await checkpoint({ checkpoint_ns: checkpointNs, checkpoint_id: 'child-b' })
            for (const overrides of [
                { tenantId: otherTenantId },
                { organizationId: randomUUID() },
                { organizationId: null },
                { thread_id: randomUUID() },
                { checkpoint_ns: 'other:namespace' },
                { parent_id: 'other-parent' }
            ]) {
                await checkpoint({ checkpoint_ns: checkpointNs, checkpoint_id: randomUUID(), ...overrides })
            }
            checkpointSelects.length = 0

            const rows = await children(checkpointNs)

            expect(rows.sort((a, b) => a.checkpoint_id.localeCompare(b.checkpoint_id))).toEqual([
                { checkpoint_id: 'child-a' },
                { checkpoint_id: 'child-b' }
            ])
            expectCheckpointIdProjection(checkpointSelects)
        }
    )

    it('restricts tenant-scope reads to NULL organization rows', async () => {
        await checkpoint({ organizationId: null, checkpoint_id: 'tenant-child' })
        await checkpoint({ checkpoint_id: 'organization-child' })
        await checkpoint({ tenantId: otherTenantId, organizationId: null, checkpoint_id: 'other-tenant-child' })
        checkpointSelects.length = 0

        await expect(children('', null)).resolves.toEqual([{ checkpoint_id: 'tenant-child' }])
        expectCheckpointIdProjection(checkpointSelects)
    })

    it('returns an empty list when the parent has no child checkpoints', async () => {
        await checkpoint({ parent_id: 'unrelated' })
        checkpointSelects.length = 0
        await expect(children()).resolves.toEqual([])
        expectCheckpointIdProjection(checkpointSelects)
    })
})
