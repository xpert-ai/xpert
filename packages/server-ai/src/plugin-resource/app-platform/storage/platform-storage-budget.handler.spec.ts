import { CheckStorageQuotaCommand, RequestStorageUsageRefreshCommand } from '@xpert-ai/server-core'
import * as layout from '../../../shared/volume/volume-layout'
import * as trees from './storage-tree'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    CheckStorageQuotaHandler,
    RequestStorageUsageRefreshHandler,
    StorageQuotaAccountResolver
} from './platform-storage-budget.handler'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'

const owner = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
function fixture() {
    const account = Object.assign(new AppPlatformDelivery(), {
        ...owner,
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: { maxStorageBytes: 100, maxTemporaryBytes: 16 } } }
        }
    })
    const accounts = { resolve: jest.fn().mockResolvedValue(account) }
    const snapshot = { externalBytes: 70, databaseBytes: 20, measuredAt: new Date(), refreshRequested: false }
    const usage = {
        snapshot: jest.fn().mockResolvedValue(snapshot),
        refresh: jest.fn(),
        requestRefresh: jest.fn(),
        validateSandboxRoot: jest.fn()
    }
    return {
        account,
        accounts,
        snapshot,
        usage,
        handler: new CheckStorageQuotaHandler(accounts as never, usage as never)
    }
}
describe('snapshot storage admission', () => {
    it('allows concurrent growth above the remaining estimate without reservations or scans', async () => {
        const f = fixture()
        const command = new CheckStorageQuotaCommand({ kind: 'write', scope: owner, growthBytes: 50 })
        await expect(Promise.all([f.handler.execute(command), f.handler.execute(command)])).resolves.toEqual([
            null,
            null
        ])
        expect(f.usage.refresh).not.toHaveBeenCalled()
        expect(f.snapshot.externalBytes).toBe(70)
    })
    it.each(['write', 'run'] as const)('blocks new %s at the measured limit', async (kind) => {
        const f = fixture()
        f.snapshot.externalBytes = 80
        await expect(f.handler.execute(new CheckStorageQuotaCommand({ kind, scope: owner }))).rejects.toMatchObject({
            status: 413
        })
    })
    it.each([0, -10])('allows a non-growing replacement (%s) even when over quota', async (growthBytes) => {
        const f = fixture()
        f.snapshot.externalBytes = 1000
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner, growthBytes }))
        ).resolves.toBeNull()
        expect(f.usage.snapshot).not.toHaveBeenCalled()
    })
    it('uses a recent stale snapshot without foreground reconciliation', async () => {
        const f = fixture()
        f.snapshot.measuredAt = new Date(Date.now() - 6 * 60_000)
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner }))
        ).resolves.toBeNull()
        expect(f.usage.refresh).not.toHaveBeenCalled()
    })
    it('rejects a long unavailable collector instead of allowing unlimited stale writes', async () => {
        const f = fixture()
        f.snapshot.measuredAt = new Date(Date.now() - 16 * 60_000)
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'run', scope: owner }))
        ).rejects.toMatchObject({ status: 503 })
        expect(f.usage.requestRefresh).toHaveBeenCalledWith(f.account)
    })
    it('initializes a missing snapshot once, then applies the measured limit', async () => {
        const f = fixture()
        f.usage.snapshot.mockResolvedValueOnce(null)
        await f.handler.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner }))
        expect(f.usage.refresh).toHaveBeenCalledTimes(1)
    })
    it('fails closed while another collector is creating the first snapshot', async () => {
        const f = fixture()
        f.usage.snapshot.mockResolvedValue(null)
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner }))
        ).rejects.toMatchObject({ status: 503 })
    })
    it('does not apply managed-account quotas to ordinary platform users', async () => {
        const f = fixture()
        f.accounts.resolve.mockResolvedValue(null)
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'write', scope: owner }))
        ).resolves.toBeNull()
        expect(f.usage.snapshot).not.toHaveBeenCalled()
    })
    it('keeps the temporary directory limit independent of approximate durable usage', async () => {
        const f = fixture()
        await expect(
            f.handler.execute(new CheckStorageQuotaCommand({ kind: 'temporary', scope: owner, bytes: 16 }))
        ).resolves.toBeNull()
        for (const bytes of [17, -1, NaN])
            await expect(
                f.handler.execute(new CheckStorageQuotaCommand({ kind: 'temporary', scope: owner, bytes }))
            ).rejects.toMatchObject({ status: 413 })
    })
    it('derives sandbox ceilings from the workspace size and the approximate free allowance', async () => {
        const f = fixture()
        jest.spyOn(layout, 'usesFlattenedSandboxVolumeLayout').mockReturnValue(false)
        jest.spyOn(trees, 'measureStorageTrees').mockResolvedValue(8)
        f.usage.validateSandboxRoot.mockResolvedValue('/authorized-root')
        try {
            await expect(
                f.handler.execute(
                    new CheckStorageQuotaCommand({
                        kind: 'sandbox',
                        scope: { ...owner, kind: 'user' },
                        root: '/authorized-root'
                    })
                )
            ).resolves.toEqual({ maxWorkspaceBytes: 18, maxTemporaryBytes: 16 })
            f.usage.validateSandboxRoot.mockRejectedValueOnce(new Error('foreign root'))
            await expect(
                f.handler.execute(
                    new CheckStorageQuotaCommand({
                        kind: 'sandbox',
                        scope: { ...owner, kind: 'user' },
                        root: '/foreign-root'
                    })
                )
            ).rejects.toThrow('foreign root')
        } finally {
            jest.restoreAllMocks()
        }
    })
    it('marks deletion dirty without doing a synchronous scan', async () => {
        const f = fixture()
        await new RequestStorageUsageRefreshHandler(f.accounts as never, f.usage as never).execute(
            new RequestStorageUsageRefreshCommand(owner)
        )
        expect(f.usage.requestRefresh).toHaveBeenCalledWith(f.account)
        expect(f.usage.refresh).not.toHaveBeenCalled()
    })
})
describe('storage ownership resolution', () => {
    afterEach(() => jest.restoreAllMocks())
    it('uses the persisted resource organization instead of a caller override', async () => {
        const organizationId = '11111111-1111-4111-8111-111111111111'
        const repository = { findOneBy: jest.fn().mockResolvedValue({ userId: 'owner' }) }
        const database = { query: jest.fn().mockResolvedValue([{ organizationId }]), getRepository: () => repository }
        await new StorageQuotaAccountResolver(database as never).resolve({ ...owner, kind: 'project', id: 'project' })
        expect(repository.findOneBy).toHaveBeenCalledWith({ tenantId: owner.tenantId, organizationId })
    })
    it('rejects missing resources and managed callers outside their provisioned scope', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const repository = { findOneBy: jest.fn().mockResolvedValue(null), existsBy: jest.fn().mockResolvedValue(true) }
        const resolver = new StorageQuotaAccountResolver({
            query: jest.fn().mockResolvedValue([]),
            getRepository: () => repository
        } as never)
        await expect(resolver.resolve({ ...owner, kind: 'project', id: 'missing' })).rejects.toMatchObject({
            status: 403
        })
        await expect(resolver.resolve(owner)).rejects.toMatchObject({ status: 403 })
    })
})
