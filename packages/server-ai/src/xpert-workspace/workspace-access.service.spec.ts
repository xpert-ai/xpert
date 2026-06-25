import { ApiKeyBindingType, IApiPrincipal, IUser, RolesEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

describe('XpertWorkspaceAccessService', () => {
    let service: XpertWorkspaceAccessService
    let workspaceRepository: Pick<Repository<XpertWorkspace>, 'manager'>
    let xpertQueryBuilder: {
        select: jest.Mock
        addSelect: jest.Mock
        from: jest.Mock
        where: jest.Mock
        andWhere: jest.Mock
        limit: jest.Mock
        getRawOne: jest.Mock
    }

    beforeEach(() => {
        xpertQueryBuilder = {
            select: jest.fn(),
            addSelect: jest.fn(),
            from: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            limit: jest.fn(),
            getRawOne: jest.fn()
        }
        Object.values(xpertQueryBuilder)
            .filter((mock) => mock !== xpertQueryBuilder.getRawOne)
            .forEach((mock) => mock.mockReturnValue(xpertQueryBuilder))
        workspaceRepository = {
            manager: {
                createQueryBuilder: jest.fn(() => xpertQueryBuilder)
            }
        } as unknown as Pick<Repository<XpertWorkspace>, 'manager'>
        service = new XpertWorkspaceAccessService(workspaceRepository as Repository<XpertWorkspace>)

        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER }
        } as IUser)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('allows organization users to read and run tenant-shared workspaces without write access', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: null,
            ownerId: 'owner-1',
            settings: { access: { visibility: 'tenant-shared' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: true,
            canRun: true,
            canWrite: false,
            canManage: false
        })
    })

    it('keeps tenant-private workspaces hidden from organization scope users', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: null,
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toMatchObject({
            canRead: false
        })
    })

    it('allows tenant-scope owners to manage tenant-shared workspaces', async () => {
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({
            id: 'owner-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.ADMIN }
        })
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        ;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(true)

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: null,
            ownerId: 'owner-1',
            settings: { access: { visibility: 'tenant-shared' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: true,
            canRun: true,
            canWrite: true,
            canManage: true
        })
    })

    it('allows assistant api key principals to read and run their bound xpert workspace without a persisted xpert user', async () => {
        const principal = {
            id: 'assistant-user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            apiKeyUserId: 'assistant-user-1',
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
            userId: null,
            workspaceId: 'workspace-1'
        })

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: true,
            canRun: true,
            canWrite: false,
            canManage: false
        })
    })

    it('allows public xpert client secrets to read and run their bound workspace', async () => {
        const principal = {
            id: 'anonymous-user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
            userId: 'assistant-service-user-1',
            workspaceId: 'workspace-1'
        })

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: true,
            canRun: true,
            canWrite: false,
            canManage: false
        })
        expect(xpertQueryBuilder.andWhere).toHaveBeenCalledWith('xpert."publishAt" IS NOT NULL')
        expect(xpertQueryBuilder.andWhere).toHaveBeenCalledWith(
            `COALESCE((xpert.app)::jsonb ->> 'enabled', 'false') = 'true'`
        )
        expect(xpertQueryBuilder.andWhere).toHaveBeenCalledWith(
            `COALESCE((xpert.app)::jsonb ->> 'public', 'false') = 'true'`
        )
    })

    it('allows workspace api keys to read and run their bound workspace', async () => {
        const principal = {
            id: 'owner-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.WORKSPACE,
                entityId: 'workspace-1'
            },
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'other-user',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: true,
            canRun: true,
            canWrite: false,
            canManage: false
        })
        expect(workspaceRepository.manager.createQueryBuilder).not.toHaveBeenCalled()
    })

    it('does not grant public xpert client secrets access to other workspaces', async () => {
        const principal = {
            id: 'anonymous-user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
            userId: 'assistant-service-user-1',
            workspaceId: 'workspace-2'
        })

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: false,
            canRun: false,
            canWrite: false,
            canManage: false
        })
    })

    it('does not grant workspace api key access to other workspaces', async () => {
        const principal = {
            id: 'owner-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.WORKSPACE,
                entityId: 'workspace-2'
            },
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'other-user',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: false,
            canRun: false,
            canWrite: false,
            canManage: false
        })
    })

    it('does not grant assistant api key access to other workspaces', async () => {
        const principal = {
            id: 'assistant-user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            apiKeyUserId: 'assistant-user-1',
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
            userId: 'assistant-user-1',
            workspaceId: 'workspace-2'
        })

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: false,
            canRun: false,
            canWrite: false,
            canManage: false
        })
    })

    it('does not grant assistant api key access when the current user does not match the api key principal user', async () => {
        const principal = {
            id: 'user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            apiKeyUserId: 'assistant-user-1',
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
            userId: null,
            workspaceId: 'workspace-1'
        })

        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            settings: { access: { visibility: 'private' } },
            members: []
        })

        await expect(service.getCapabilities(workspace)).resolves.toEqual({
            canRead: false,
            canRun: false,
            canWrite: false,
            canManage: false
        })
    })
})
