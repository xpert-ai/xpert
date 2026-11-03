import { ContentCatalogMaintenance } from './content-catalog-maintenance.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveExecutionIdentityCommand } from '@xpert-ai/server-core'
import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'

const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'human' }
function fixture() {
    const row = {
        id: 'operation',
        nextAttemptAt: new Date(0),
        payload: { kind: 'refresh', input: { actor, projectId: 'project', contentId: 'content' } }
    }
    const rows = { find: jest.fn(async () => [row]), update: jest.fn(async () => ({ affected: 1 })) }
    const operations = { rows, finish: jest.fn() }
    const catalog = { reconcile: jest.fn(), create: jest.fn(), mutate: jest.fn() }
    const users = { execute: jest.fn(async () => executionIdentityFixture(actor)) }
    return {
        row,
        rows,
        operations,
        catalog,
        users,
        worker: new ContentCatalogMaintenance(operations as never, catalog as never, users as never)
    }
}
beforeEach(() => jest.clearAllMocks())
it('leases persisted work and restores the real actor context before reauthorization', async () => {
    const f = fixture()
    f.catalog.reconcile.mockImplementation(async () => {
        expect(RequestContext.currentUserId()).toBe(actor.userId)
        expect(RequestContext.getOrganizationId()).toBe(actor.organizationId)
    })
    await f.worker.repair()
    expect(f.users.execute).toHaveBeenCalledWith(new ResolveExecutionIdentityCommand({ ...actor, kind: 'user' }))
    expect(f.catalog.reconcile).toHaveBeenCalledWith(f.row.payload.input)
    expect(f.operations.finish).toHaveBeenCalledWith(f.row)
})
it('skips a lease already claimed by another instance', async () => {
    const f = fixture()
    f.rows.update.mockResolvedValue({ affected: 0 })
    await f.worker.repair()
    expect(f.users.execute).not.toHaveBeenCalled()
    expect(f.operations.finish).not.toHaveBeenCalled()
})
it('retains a failed operation if the persisted actor is no longer authorized', async () => {
    const f = fixture(),
        denied = new Error('membership revoked')
    f.catalog.reconcile.mockRejectedValue(denied)
    await f.worker.repair()
    expect(f.operations.finish).toHaveBeenCalledWith(f.row, denied)
    expect(f.catalog.create).not.toHaveBeenCalled()
})
