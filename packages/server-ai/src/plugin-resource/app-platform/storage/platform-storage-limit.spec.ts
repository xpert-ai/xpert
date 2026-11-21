import { organizationStorageLimit } from './platform-storage-limit'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import * as membership from '../../../membership/membership-storage'

describe('organization storage allowance', () => {
    afterEach(() => jest.restoreAllMocks())
    const scope = { tenantId: 'tenant', organizationId: 'org-a' }
    const delivery = (organizationId: string, bytes: number, userId = 'user') =>
        Object.assign(new AppPlatformDelivery(), {
            tenantId: 'tenant',
            userId,
            organizationId,
            configuration: {
                definition: { entitlements: { defaultPlanRef: 'trial' } },
                environment: { plans: { trial: { maxStorageBytes: bytes } } }
            }
        })
    function fixture() {
        const rows = [delivery('org-a', 100), delivery('org-a', 200, 'other-member'), delivery('org-b', 900)]
        const find = jest.fn(async ({ where }: { where: typeof scope }) =>
            rows.filter((row) => row.tenantId === where.tenantId && row.organizationId === where.organizationId)
        )
        const manager = { getRepository: jest.fn((_entity: unknown) => ({ find })) }
        const paid = jest.spyOn(membership, 'organizationMembershipStorageBytes').mockResolvedValue(null)
        return { rows, find, manager, paid }
    }
    it('preserves the largest existing organization floor without summing members or Apps', async () => {
        const f = fixture()
        await expect(organizationStorageLimit(f.manager as never, scope)).resolves.toBe(200)
        f.paid.mockResolvedValue(700)
        await expect(organizationStorageLimit(f.manager as never, scope)).resolves.toBe(700)
        f.paid.mockResolvedValue(50)
        await expect(organizationStorageLimit(f.manager as never, scope)).resolves.toBe(200)
        expect(f.find).toHaveBeenCalledWith({ where: scope })
        expect(f.paid).toHaveBeenCalledWith(f.manager, scope)
    })
    it('separates two organizations belonging to the same user and identical organization ids in different tenants', async () => {
        const f = fixture()
        await expect(organizationStorageLimit(f.manager as never, { ...scope, organizationId: 'org-b' })).resolves.toBe(
            900
        )
        await expect(
            organizationStorageLimit(f.manager as never, { ...scope, tenantId: 'other-tenant' })
        ).resolves.toBeNull()
    })
    it('does not derive capacity from the current members or delivery creator', async () => {
        const f = fixture()
        const before = await organizationStorageLimit(f.manager as never, scope)
        f.rows.forEach((row) => (row.userId = 'departed-member'))
        await expect(organizationStorageLimit(f.manager as never, scope)).resolves.toBe(before)
        expect(f.manager.getRepository.mock.calls.every(([entity]) => entity === AppPlatformDelivery)).toBe(true)
    })
    it('rejects missing organization identity instead of falling back to user scope', async () => {
        const f = fixture()
        await expect(
            organizationStorageLimit(f.manager as never, { ...scope, organizationId: '' })
        ).rejects.toMatchObject({ status: 403 })
        expect(f.find).not.toHaveBeenCalled()
    })
})
