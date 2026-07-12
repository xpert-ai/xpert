import { ApiKeyBindingType, IApiPrincipal, IUser, RolesEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Brackets, Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

describe('XpertWorkspaceAccessService', () => {
    let service: XpertWorkspaceAccessService
    let workspaceRepository: Pick<Repository<XpertWorkspace>, 'createQueryBuilder' | 'manager'>
    let workspaceQueryBuilder: {
        leftJoinAndSelect: jest.Mock
        where: jest.Mock
        andWhere: jest.Mock
        addOrderBy: jest.Mock
        getMany: jest.Mock
    }
    let xpertQueryBuilder: {
        select: jest.Mock
        addSelect: jest.Mock
        from: jest.Mock
        innerJoin: jest.Mock
        where: jest.Mock
        andWhere: jest.Mock
        limit: jest.Mock
        getRawOne: jest.Mock
        getCount: jest.Mock
    }

    beforeEach(() => {
        workspaceQueryBuilder = {
            leftJoinAndSelect: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            addOrderBy: jest.fn(),
            getMany: jest.fn()
        }
        Object.values(workspaceQueryBuilder)
            .filter((mock) => mock !== workspaceQueryBuilder.getMany)
            .forEach((mock) => mock.mockReturnValue(workspaceQueryBuilder))
        workspaceQueryBuilder.getMany.mockResolvedValue([])
        xpertQueryBuilder = {
            select: jest.fn(),
            addSelect: jest.fn(),
            from: jest.fn(),
            innerJoin: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            limit: jest.fn(),
            getRawOne: jest.fn(),
            getCount: jest.fn().mockResolvedValue(0)
        }
        Object.values(xpertQueryBuilder)
            .filter((mock) => mock !== xpertQueryBuilder.getRawOne && mock !== xpertQueryBuilder.getCount)
            .forEach((mock) => mock.mockReturnValue(xpertQueryBuilder))
        workspaceRepository = {
            createQueryBuilder: jest.fn(() => workspaceQueryBuilder),
            manager: {
                createQueryBuilder: jest.fn(() => xpertQueryBuilder)
            }
        } as unknown as Pick<Repository<XpertWorkspace>, 'createQueryBuilder' | 'manager'>
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

    it('keeps tenant scope workspace listing scoped to tenant workspaces by default', async () => {
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        ;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(true)

        await service.findAccessibleWorkspaces()

        expect(workspaceQueryBuilder.andWhere).toHaveBeenCalledWith('workspace.organizationId IS NULL')
    })

    it('can include organization workspaces in tenant scope for cross-scope xpert availability checks', async () => {
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        ;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(true)

        await service.findAccessibleWorkspaces(undefined, {
            includeOrganizationWorkspacesInTenantScope: true
        })

        expect(workspaceQueryBuilder.andWhere).not.toHaveBeenCalledWith('workspace.organizationId IS NULL')
        const scopeBracket = readBrackets(workspaceQueryBuilder.andWhere.mock.calls.at(-1)?.[0])
        const scopeQuery = createWhereExpressionBuilder()

        scopeBracket.whereFactory(scopeQuery)
        const tenantBracket = readBrackets(scopeQuery.where.mock.calls[0]?.[0])
        const organizationBracket = readBrackets(scopeQuery.orWhere.mock.calls[0]?.[0])
        const tenantQuery = createWhereExpressionBuilder()
        const organizationQuery = createWhereExpressionBuilder()

        tenantBracket.whereFactory(tenantQuery)
        organizationBracket.whereFactory(organizationQuery)

        expect(tenantQuery.where).toHaveBeenCalledWith('workspace.organizationId IS NULL')
        expect(organizationQuery.where).toHaveBeenCalledWith('workspace.organizationId IS NOT NULL')
        expect(organizationQuery.where).toHaveBeenCalledWith('workspace.ownerId = :ownerId', { ownerId: 'user-1' })
        expect(organizationQuery.orWhere).toHaveBeenCalledWith('member.id = :userId', { userId: 'user-1' })
    })

    it('includes tenant-shared workspaces in organization scope for runtime access by default', async () => {
        await service.findAccessibleWorkspaces()

        const scopeBracket = readBrackets(workspaceQueryBuilder.andWhere.mock.calls.at(-1)?.[0])
        const scopeQuery = createWhereExpressionBuilder()

        scopeBracket.whereFactory(scopeQuery)
        expect(scopeQuery.where).toHaveBeenCalled()
        expect(scopeQuery.orWhere).toHaveBeenCalledTimes(1)

        const tenantBracket = readBrackets(scopeQuery.orWhere.mock.calls[0]?.[0])
        const tenantQuery = createWhereExpressionBuilder()
        tenantBracket.whereFactory(tenantQuery)

        expect(tenantQuery.where).toHaveBeenCalledWith('workspace.organizationId IS NULL')
        expect(tenantQuery.andWhere).toHaveBeenCalledWith(
            `COALESCE((workspace.settings)::jsonb -> 'access' ->> 'visibility', 'private') = :tenantSharedVisibility`,
            { tenantSharedVisibility: 'tenant-shared' }
        )
    })

    it('excludes tenant-shared workspaces in organization scope for authoring access', async () => {
        await service.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })

        const scopeBracket = readBrackets(workspaceQueryBuilder.andWhere.mock.calls.at(-1)?.[0])
        const scopeQuery = createWhereExpressionBuilder()

        scopeBracket.whereFactory(scopeQuery)
        expect(scopeQuery.where).toHaveBeenCalled()
        expect(scopeQuery.orWhere).not.toHaveBeenCalled()
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

    it('grants runtime-only workspace access through a published xpert user-group grant', async () => {
        xpertQueryBuilder.getCount.mockResolvedValue(1)
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
            canRun: true,
            canWrite: false,
            canManage: false
        })
        expect(xpertQueryBuilder.innerJoin).toHaveBeenCalledWith(
            'user_group_to_user',
            'ugu',
            'ugu."userGroupId" = ug.id AND ugu."userId" = :userId',
            { userId: 'user-1' }
        )
        expect(xpertQueryBuilder.andWhere).toHaveBeenCalledWith('xpert."publishAt" IS NOT NULL')
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

    it('uses persisted xpert user before the assistant api key principal user when both are available', async () => {
        const principal = {
            id: 'xpert-user-1',
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
            userId: 'xpert-user-1',
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

    it('does not fall back to the assistant api key principal user when the xpert has a different persisted user', async () => {
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
            userId: 'xpert-user-1',
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

    it('does not grant assistant api key access when the api key principal user cannot be resolved', async () => {
        const principal = {
            id: 'user-1',
            tenantId: 'tenant-1',
            role: { name: RolesEnum.VIEWER },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: 'xpert-1'
            },
            principalType: 'api_key'
        } as IApiPrincipal
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue(principal)
        ;(RequestContext.currentApiPrincipal as jest.Mock).mockReturnValue(principal)
        xpertQueryBuilder.getRawOne.mockResolvedValue({
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

type TestWhereExpressionBuilder = {
    where: jest.Mock
    orWhere: jest.Mock
    andWhere: jest.Mock
}
type TestBrackets = Brackets & {
    whereFactory: (query: TestWhereExpressionBuilder) => void
}

function createWhereExpressionBuilder(): TestWhereExpressionBuilder {
    return {
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis()
    }
}

function readBrackets(value: unknown): TestBrackets {
    if (value instanceof Brackets && 'whereFactory' in value && typeof value.whereFactory === 'function') {
        return value as TestBrackets
    }

    throw new Error('Expected TypeORM Brackets')
}
