import { SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { createFixture } from './model-access-service.test-fixture'

describe('ModelAccessService Xpert billing attribution', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('bills an authenticated regular user for a shared Xpert', async () => {
        const { input, membershipService, service } = createFixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: input.userId,
            tenantId: input.tenantId,
            type: UserType.USER
        })
        membershipService.resolveBillableUserId.mockResolvedValue(input.userId)

        await service.resolveModelAccess(input)

        expect(membershipService.resolveBillableUserId).toHaveBeenCalledWith({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: 'runtime_user'
        })
    })

    it('keeps a public Xpert session billed to the creator', async () => {
        const { input, membershipService, service } = createFixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: input.userId,
            tenantId: input.tenantId,
            type: UserType.COMMUNICATION,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
        })

        await service.resolveModelAccess(input)

        expect(membershipService.resolveBillableUserId).toHaveBeenCalledWith({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: 'xpert_creator'
        })
    })

    it.each([SecretTokenBindingType.USER_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT])(
        'bills the delegated user for %s access',
        async (clientSecretBindingType) => {
            const { input, membershipService, service } = createFixture()
            jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
                id: input.userId,
                tenantId: input.tenantId,
                type: UserType.USER,
                principalType: 'client_secret',
                clientSecretBindingType,
                requestedUserId: input.userId
            })
            membershipService.resolveBillableUserId.mockResolvedValue(input.userId)

            await service.resolveModelAccess(input)

            expect(membershipService.resolveBillableUserId).toHaveBeenCalledWith({
                tenantId: input.tenantId,
                userId: input.userId,
                xpertId: input.xpertId,
                xpertBillingPayer: 'runtime_user'
            })
        }
    )

    it('keeps a background assistant principal billed to the creator', async () => {
        const { input, membershipService, service } = createFixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: input.userId,
            tenantId: input.tenantId,
            type: UserType.COMMUNICATION,
            principalType: 'api_key'
        })

        await service.resolveModelAccess(input)

        expect(membershipService.resolveBillableUserId).toHaveBeenCalledWith({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: 'xpert_creator'
        })
    })

    it('does not trust a delegated payer that differs from the runtime user', async () => {
        const { input, membershipService, service } = createFixture()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: input.userId,
            tenantId: input.tenantId,
            type: UserType.USER,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            requestedUserId: 'different-user'
        })

        await service.resolveModelAccess(input)

        expect(membershipService.resolveBillableUserId).toHaveBeenCalledWith({
            tenantId: input.tenantId,
            userId: input.userId,
            xpertId: input.xpertId,
            xpertBillingPayer: 'xpert_creator'
        })
    })
})
