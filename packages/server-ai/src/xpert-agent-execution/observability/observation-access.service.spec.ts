import { RolesEnum, SecretTokenBindingType, type IApiPrincipal } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { User, Role } from '@xpert-ai/server-core'
import { ObservationAccessService } from './observation-access.service'

describe('execution observation authorization', () => {
    const users = { findOne: jest.fn<Promise<User | null>, []>() }
    const memberships = { existsBy: jest.fn<Promise<boolean>, []>() }
    const organizations = { existsBy: jest.fn<Promise<boolean>, []>() }
    const sessions = { findOne: jest.fn() }
    const queries = { execute: jest.fn() }
    const nativeSession = (): IApiPrincipal => ({
        id: 'user-a',
        tenantId: 'tenant-a',
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
        clientSecretId: 'session-a',
        resourceScope: { kind: 'assistant', xpertId: 'assistant-a' }
    })
    let service: ObservationAccessService
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-a')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-a')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        users.findOne.mockResolvedValue(
            Object.assign(new User(), {
                id: 'user-a',
                tenantId: 'tenant-a',
                role: Object.assign(new Role(), { name: RolesEnum.ADMIN })
            })
        )
        memberships.existsBy.mockResolvedValue(true)
        organizations.existsBy.mockResolvedValue(true)
        sessions.findOne.mockResolvedValue({ id: 'session-a', validUntil: new Date(Date.now() + 60000) })
        queries.execute.mockResolvedValue(undefined)
        service = new ObservationAccessService(users, memberships, organizations, sessions, queries)
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })
    it('revalidates role and organization membership on every read', async () => {
        const scope = service.bind({})
        await service.assert(scope)
        memberships.existsBy.mockResolvedValue(false)
        await expect(service.assert(scope)).rejects.toThrow()
        expect(memberships.existsBy).toHaveBeenCalledWith({
            tenantId: 'tenant-a',
            organizationId: 'org-a',
            userId: 'user-a',
            isActive: true
        })
    })
    it('denies ordinary users and soft-deleted users', async () => {
        const scope = service.bind({})
        users.findOne.mockResolvedValue(
            Object.assign(new User(), { role: Object.assign(new Role(), { name: RolesEnum.VIEWER }) })
        )
        await expect(service.assert(scope)).rejects.toThrow()
        users.findOne.mockResolvedValue(null)
        await expect(service.assert(scope)).rejects.toThrow()
    })
    it('does not share a capability identity across callers or organizations', async () => {
        const scope = service.bind({})
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-b')
        await expect(service.assert(scope)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-a')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-b')
        await expect(service.assert(scope)).rejects.toThrow()
    })
    it('captures restricted credential audience and denies it even after the request context ends', async () => {
        const principal: IApiPrincipal = { id: 'user-a', tenantId: 'tenant-a', principalType: 'client_secret' }
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
        const scope = service.bind({})
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        await expect(service.assert(scope)).rejects.toThrow()
    })
    it('never treats absent organization as tenant-wide read permission', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        await expect(service.assert(service.bind({}))).rejects.toThrow()
    })
    it('accepts native ChatKit only for the bound Assistant and rechecks its live grant', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(nativeSession())
        const scope = service.bind({ xpertId: 'assistant-a' })
        await service.assert(scope)
        expect(sessions.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    entityId: 'assistant-a',
                    createdById: 'user-a',
                    organizationId: 'org-a',
                    type: SecretTokenBindingType.USER_XPERT
                }),
                select: { id: true, validUntil: true }
            })
        )
        expect(queries.execute).toHaveBeenCalledTimes(1)
        queries.execute.mockRejectedValue(new Error('Grant revoked'))
        await expect(service.assert(scope)).rejects.toThrow('Grant revoked')
    })
    it.each([
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.API_KEY,
        SecretTokenBindingType.USER_CONVERSATION
    ])('rejects %s credentials even for an administrator', async (binding) => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            ...nativeSession(),
            clientSecretBindingType: binding
        })
        await expect(service.assert(service.bind({ xpertId: 'assistant-a' }))).rejects.toThrow()
    })
    it('rejects foreign Assistant, expired/revoked sessions and lost request audience', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(nativeSession())
        await expect(service.assert(service.bind({ xpertId: 'assistant-b' }))).rejects.toThrow()
        const scope = service.bind({ xpertId: 'assistant-a' })
        sessions.findOne.mockResolvedValue({ validUntil: new Date(0) })
        await expect(service.assert(scope)).rejects.toThrow()
        sessions.findOne.mockResolvedValue(null)
        await expect(service.assert(scope)).rejects.toThrow()
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        await expect(service.assert(scope)).rejects.toThrow()
    })
})
