import { accountStorageLimit } from './platform-storage-limit'
import { AppPlatformDelivery } from '../app-platform-delivery.entity'
import * as membership from '../../../membership/membership-storage'

describe('shared account storage allowance', () => {
    afterEach(() => jest.restoreAllMocks())
    const delivery = (organizationId: string, bytes: number) =>
        Object.assign(new AppPlatformDelivery(), {
            tenantId: 'tenant',
            userId: 'user',
            organizationId,
            configuration: {
                definition: { entitlements: { defaultPlanRef: 'trial' } },
                environment: { plans: { trial: { maxStorageBytes: bytes } } }
            }
        })
    it('preserves the base floor, then applies the largest current paid capacity without summing', async () => {
        const resolve = jest.spyOn(membership, 'membershipStorageBytes')
        resolve.mockResolvedValue(null)
        const accounts = [delivery('org-a', 100), delivery('org-b', 200)]
        await expect(accountStorageLimit({} as never, accounts)).resolves.toBe(100)
        resolve.mockResolvedValueOnce(500).mockResolvedValueOnce(700)
        await expect(accountStorageLimit({} as never, accounts)).resolves.toBe(700)
        expect(resolve).toHaveBeenCalledWith({}, { tenantId: 'tenant', userId: 'user', organizationId: 'org-b' })
        resolve.mockResolvedValue(50)
        await expect(accountStorageLimit({} as never, accounts)).resolves.toBe(100)
    })
})
