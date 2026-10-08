import { ForbiddenException } from '@nestjs/common'
import { CommandBus, CommandHandler, CqrsModule, ICommandHandler } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand, User } from '@xpert-ai/server-core'
import { XpertWorkspaceAccessService } from '../../workspace-access.service'
import { XpertWorkspace } from '../../workspace.entity'
import { EnsurePersonalDefaultWorkspaceCommand } from '../ensure-personal-default-workspace.command'
import { CommandHandlers } from './index'

@CommandHandler(ResolveUserOrganizationAccessCommand)
class OrganizationAccessPolicy implements ICommandHandler<ResolveUserOrganizationAccessCommand> {
    execute = jest.fn(async (_command: ResolveUserOrganizationAccessCommand): Promise<User | null> => new User())
}

describe('EnsurePersonalDefaultWorkspaceCommand', () => {
    let module: TestingModule
    const scope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }
    const query = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn(async (): Promise<XpertWorkspace[]> => [])
    }
    const repository = {
        createQueryBuilder: jest.fn(() => query),
        create: jest.fn((input: Partial<XpertWorkspace>) => Object.assign(new XpertWorkspace(), input)),
        save: jest.fn(async (workspace: XpertWorkspace) => Object.assign(workspace, { id: 'new-personal' }))
    }
    const access = { assertCanAuthor: jest.fn(async (_id: string) => undefined) }
    const execute = () => module.get(CommandBus).execute(new EnsurePersonalDefaultWorkspaceCommand('Bosi'))
    const policy = () => module.get(OrganizationAccessPolicy)

    function personal(overrides?: Partial<XpertWorkspace>) {
        return Object.assign(new XpertWorkspace(), {
            id: 'personal',
            name: 'My existing space',
            ...scope,
            ownerId: scope.userId,
            status: 'active',
            members: [],
            settings: { access: { visibility: 'private' }, system: { kind: 'user-default', userId: scope.userId } },
            ...overrides
        })
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        query.getMany.mockResolvedValue([])
        repository.save.mockImplementation(async (workspace) => Object.assign(workspace, { id: 'new-personal' }))
        access.assertCanAuthor.mockResolvedValue(undefined)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            providers: [
                ...CommandHandlers,
                OrganizationAccessPolicy,
                { provide: getRepositoryToken(XpertWorkspace), useValue: repository },
                { provide: XpertWorkspaceAccessService, useValue: access }
            ]
        }).compile()
        await module.init()
    })

    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
    })

    it('creates a private workspace through the registered command after organization policy grants access', async () => {
        const result = await execute()
        expect(policy().execute).toHaveBeenCalledWith(new ResolveUserOrganizationAccessCommand(scope))
        expect(policy().execute.mock.invocationCallOrder[0]).toBeLessThan(
            repository.createQueryBuilder.mock.invocationCallOrder[0]
        )
        expect(result).toMatchObject({
            id: 'new-personal',
            name: 'Bosi',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'user-1',
            status: 'active',
            members: [],
            createdBy: { id: 'user-1' },
            updatedBy: { id: 'user-1' },
            settings: { access: { visibility: 'private' }, system: { kind: 'user-default', userId: 'user-1' } }
        })
        expect(access.assertCanAuthor).toHaveBeenCalledWith('new-personal')
    })

    it.each(['currentTenantId', 'getOrganizationId', 'currentUserId'] as const)(
        'rejects missing %s before database access',
        async (method) => {
            jest.spyOn(RequestContext, method).mockReturnValue(null)
            await expect(execute()).rejects.toBeInstanceOf(ForbiddenException)
            expect(policy().execute).not.toHaveBeenCalled()
            expect(repository.createQueryBuilder).not.toHaveBeenCalled()
            expect(repository.save).not.toHaveBeenCalled()
        }
    )

    it('does not create a workspace when the shared organization policy denies access', async () => {
        policy().execute.mockResolvedValueOnce(null)
        await expect(execute()).rejects.toBeInstanceOf(ForbiddenException)
        expect(repository.createQueryBuilder).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('propagates policy errors instead of treating them as first-time onboarding', async () => {
        policy().execute.mockRejectedValueOnce(new Error('policy unavailable'))
        await expect(execute()).rejects.toThrow('policy unavailable')
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('reuses an eligible private workspace without renaming or saving it', async () => {
        const existing = personal()
        query.getMany.mockResolvedValueOnce([existing])
        expect(await execute()).toBe(existing)
        expect(existing.name).toBe('My existing space')
        expect(access.assertCanAuthor).toHaveBeenCalledWith(existing.id)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('supports legacy private workspaces without an explicit visibility or status', async () => {
        const existing = personal({
            status: null,
            settings: { system: { kind: 'user-default', userId: scope.userId } }
        })
        query.getMany.mockResolvedValueOnce([existing])
        expect(await execute()).toBe(existing)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it.each([
        { settings: { access: { visibility: 'organization-shared' as const } } },
        { settings: { access: { visibility: 'tenant-shared' as const } } },
        { members: [{ id: 'other-user' }] },
        { status: 'archived' as const },
        { status: 'deprecated' as const }
    ])('does not reuse an ineligible workspace: %j', async (overrides) => {
        const existing = personal(overrides)
        query.getMany.mockResolvedValueOnce([existing])
        expect((await execute()).id).toBe('new-personal')
        expect(access.assertCanAuthor).not.toHaveBeenCalledWith(existing.id)
        expect(existing).toMatchObject(overrides)
    })

    it('finds a later private candidate when an older default was shared', async () => {
        const shared = personal({ id: 'shared', settings: { access: { visibility: 'organization-shared' } } })
        const existing = personal()
        query.getMany.mockResolvedValueOnce([shared, existing])
        expect(await execute()).toBe(existing)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('retains workspace authoring authorization after organization access is granted', async () => {
        query.getMany.mockResolvedValueOnce([personal()])
        access.assertCanAuthor.mockRejectedValueOnce(new ForbiddenException('access revoked'))
        await expect(execute()).rejects.toThrow('access revoked')
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('does not create a replacement when workspace lookup fails', async () => {
        query.getMany.mockRejectedValueOnce(new Error('storage unavailable'))
        await expect(execute()).rejects.toThrow('storage unavailable')
        expect(repository.save).not.toHaveBeenCalled()
    })

    it.each([
        { tenantId: 'tenant-2', organizationId: 'org-1', userId: 'user-1' },
        { tenantId: 'tenant-1', organizationId: 'org-2', userId: 'user-1' },
        { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-2' }
    ])('scopes lookup and creation to the current identity: %j', async (current) => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(current.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(current.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(current.userId)
        const result = await execute()
        expect(policy().execute).toHaveBeenCalledWith(new ResolveUserOrganizationAccessCommand(current))
        expect(query.where).toHaveBeenCalledWith('workspace.tenantId = :tenantId', { tenantId: current.tenantId })
        expect(query.andWhere).toHaveBeenCalledWith('workspace.organizationId = :organizationId', {
            organizationId: current.organizationId
        })
        expect(query.andWhere).toHaveBeenCalledWith('workspace.ownerId = :userId', { userId: current.userId })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining("->> 'kind'"), { kind: 'user-default' })
        expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining("->> 'userId'"), { userId: current.userId })
        expect(query.leftJoinAndSelect).toHaveBeenCalledWith('workspace.members', 'members')
        expect(result).toMatchObject({
            tenantId: current.tenantId,
            organizationId: current.organizationId,
            ownerId: current.userId
        })
    })

    it('reuses a successfully created workspace when the caller retries', async () => {
        const first = await execute()
        // The previous command saved this row; subsequent lookup returns it.
        query.getMany.mockResolvedValueOnce([Object.assign(new XpertWorkspace(), first)])
        expect((await execute()).id).toBe(first.id)
        expect(repository.save).toHaveBeenCalledTimes(1)
    })
})
