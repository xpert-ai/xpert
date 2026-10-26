import { ConflictException } from '@nestjs/common'
import { ContentOperations } from './content-operations.service'

it('persists immutable create intent without credentials and tolerates omitted optional fields on retries', async () => {
    let saved: unknown
    const query = {
        insert: () => query,
        values: (value) => {
            if (!saved) saved = JSON.parse(JSON.stringify(value))
            return query
        },
        orIgnore: () => query,
        execute: jest.fn()
    }
    const rows = { createQueryBuilder: () => query, findOneByOrFail: async () => saved }
    const operations = new ContentOperations(rows as never)
    const input = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'human' },
        projectId: 'project',
        assistantId: undefined,
        providerKey: 'slides',
        implementationKey: 'slides',
        requestId: 'request',
        title: 'Deck'
    }
    await operations.retain({ kind: 'create', input })
    await operations.retain({ kind: 'create', input })
    await expect(operations.retain({ kind: 'create', input: { ...input, title: 'Changed' } })).rejects.toThrow(
        ConflictException
    )
})
it('records retryable failures using bounded backoff without storing raw provider errors', async () => {
    const update = jest.fn(),
        operations = new ContentOperations({ update } as never)
    await operations.finish(
        { id: 'job', attempts: 100, payload: { kind: 'create' } } as never,
        new Error('credential-bearing external diagnostic')
    )
    expect(update).toHaveBeenCalledWith(
        'job',
        expect.objectContaining({ status: 'failed', failureCode: 'RECOVERY_FAILED' })
    )
    const next = update.mock.calls[0][1].nextAttemptAt.getTime()
    expect(next - Date.now()).toBeLessThanOrEqual(600_000)
})
