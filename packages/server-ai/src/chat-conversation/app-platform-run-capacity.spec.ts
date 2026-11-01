import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assertAppPlatformRunCapacity } from './app-platform-run-capacity'
import { AppPlatformDelivery } from '../plugin-resource/app-platform/app-platform-delivery.entity'

function fixture() {
    const snapshot = { externalBytes: 60, databaseBytes: 30, measuredAt: new Date() }
    const delivery = {
        configuration: {
            definition: { entitlements: { defaultPlanRef: 'trial' } },
            environment: { plans: { trial: { maxStorageBytes: 100, maxConcurrentRuns: 2 } } }
        }
    }
    const accounts = { findOneBy: jest.fn().mockResolvedValue(delivery) }
    const threads = { countBy: jest.fn().mockResolvedValue(0) }
    const manager = {
        query: jest.fn(async (sql: string) => (sql.includes('app_platform_storage_usage') ? [snapshot] : [])),
        getRepository: (entity: unknown) => (entity === AppPlatformDelivery ? accounts : threads)
    }
    return { manager, accounts, threads, snapshot }
}
describe('managed account run admission', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(() => jest.restoreAllMocks())
    it('allows a new run from a recent snapshot and retains concurrency admission', async () => {
        const f = fixture()
        await assertAppPlatformRunCapacity(f.manager as never)
        expect(f.threads.countBy).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant', createdById: 'user' })
        )
        expect(f.manager.query.mock.calls.every(([sql]) => !sql.includes('reconcile'))).toBe(true)
    })
    it('rejects another run once the measured account usage reaches the limit', async () => {
        const f = fixture()
        f.snapshot.externalBytes = 70
        await expect(assertAppPlatformRunCapacity(f.manager as never)).rejects.toMatchObject({ status: 413 })
    })
    it('rejects a long-stale snapshot without affecting ordinary accounts', async () => {
        const f = fixture()
        f.snapshot.measuredAt = new Date(Date.now() - 16 * 60_000)
        await expect(assertAppPlatformRunCapacity(f.manager as never)).rejects.toMatchObject({ status: 503 })
        f.accounts.findOneBy.mockResolvedValue(null)
        await expect(assertAppPlatformRunCapacity(f.manager as never)).resolves.toBeUndefined()
    })
    it('preserves the independent simultaneous-run cap below the storage limit', async () => {
        const f = fixture()
        f.threads.countBy.mockResolvedValue(2)
        await expect(assertAppPlatformRunCapacity(f.manager as never)).rejects.toMatchObject({ status: 429 })
    })
})
