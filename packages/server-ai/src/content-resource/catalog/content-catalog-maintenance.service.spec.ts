import { ContentCatalogMaintenance } from './content-catalog-maintenance.service'
import { runWithCapturedRequestContext } from '../../shared/request-context'

jest.mock('../../shared/request-context', () => ({
    runWithCapturedRequestContext: jest.fn((_context, work) => work())
}))

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
    const users = { findOneOrFail: jest.fn(async () => ({ id: actor.userId, tenantId: actor.tenantId })) }
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
    await f.worker.repair()
    expect(f.users.findOneOrFail).toHaveBeenCalledWith({ where: { id: actor.userId, tenantId: actor.tenantId } })
    expect(runWithCapturedRequestContext).toHaveBeenCalledWith(
        expect.objectContaining({
            headers: { 'tenant-id': actor.tenantId, 'organization-id': actor.organizationId }
        }),
        expect.any(Function)
    )
    expect(f.catalog.reconcile).toHaveBeenCalledWith(f.row.payload.input)
    expect(f.operations.finish).toHaveBeenCalledWith(f.row)
})
it('skips a lease already claimed by another instance', async () => {
    const f = fixture()
    f.rows.update.mockResolvedValue({ affected: 0 })
    await f.worker.repair()
    expect(f.users.findOneOrFail).not.toHaveBeenCalled()
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
