import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { ApiKeyBindingType, IApiPrincipal, IUser, RolesEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FindOneOptions, Repository } from 'typeorm'
import { VolumeHandle, XpertDataVolumeScope } from '../../shared/volume'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { Xpert } from '../xpert.entity'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceFilesService } from '../xpert-workspace-files.service'
import { AssistantFileAccessService } from './assistant-file-access.service'
import { AssistantFilesService } from './assistant-files.service'

// Bind legacy consumers to the same test actor without introducing another deprecated context import.
jest.mock('@xpert-ai/server-core', () => ({
    ...jest.requireActual('@xpert-ai/server-core'),
    RequestContext: jest.requireActual('@xpert-ai/plugin-sdk').RequestContext
}))

// Persistence is a fixture; published ACL, workspace ACL, Studio access, command dispatch,
// file operations and filesystem containment use their production implementations.
describe('Assistant file authority integration', () => {
    let module: TestingModule
    let root: string
    let actor: IUser
    let principal: IApiPrincipal | null
    let groupGrant: boolean
    let assistant: Xpert
    let workspace: XpertWorkspace
    let files: AssistantFilesService
    let studio: XpertWorkspaceFilesService
    let xperts: XpertService
    let workspaceAccess: XpertWorkspaceAccessService
    let published: PublishedXpertAccessService
    let resolve: jest.Mock<VolumeHandle, [XpertDataVolumeScope]>

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'assistant-file-acl-'))
        actor = { id: 'user-b', tenantId: 'tenant-1', role: { name: RolesEnum.VIEWER } } as IUser
        principal = null
        groupGrant = true
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => actor.tenantId)
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => actor.id)
        jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => actor)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockImplementation(() => principal)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
        workspace = Object.assign(new XpertWorkspace(), {
            id: 'authoring-workspace',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'user-a',
            members: [],
            settings: { access: { visibility: 'private' } }
        })
        assistant = Object.assign(new Xpert(), {
            id: 'assistant-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'user-a',
            workspaceId: workspace.id,
            workspace,
            publishAt: new Date(),
            workspaceDataScope: 'shared'
        })
        const records = new Map([
            [assistant.id, assistant],
            ['other-assistant', Object.assign(new Xpert(), { ...assistant, id: 'other-assistant' })]
        ])
        const query = () => {
            let requestedId: string | undefined
            const capture = (_condition: unknown, parameters?: { id?: string }) => {
                if (parameters?.id) requestedId = parameters.id
                return builder
            }
            const builder = {
                leftJoin: jest.fn().mockReturnThis(),
                where: jest.fn(capture),
                andWhere: jest.fn(capture),
                getCount: jest.fn(async () =>
                    requestedId === assistant.id && groupGrant && actor.tenantId === assistant.tenantId ? 1 : 0
                )
            }
            return builder
        }
        const repository = {
            findOne: jest.fn(async (options: FindOneOptions<Xpert>) => {
                const where = options.where
                if (!where || Array.isArray(where) || typeof where.id !== 'string') return null
                const item = records.get(where.id)
                if (!item || item.tenantId !== where.tenantId || (where.publishAt && !item.publishAt)) return null
                return item
            }),
            createQueryBuilder: jest.fn(query)
        } as unknown as Repository<Xpert>
        const runQuery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getRawOne: jest.fn(async () => null),
            getCount: jest.fn(async () => (groupGrant ? 1 : 0))
        }
        const workspaceRepository = {
            findOne: jest.fn(async () => workspace),
            manager: { createQueryBuilder: () => runQuery }
        } as unknown as Repository<XpertWorkspace>
        workspaceAccess = new XpertWorkspaceAccessService(workspaceRepository)
        published = new PublishedXpertAccessService(repository, workspaceAccess)
        xperts = new XpertService(repository, workspaceAccess, null, null, null, null, null, null, null, null)
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                AssistantFileAccessService,
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: XpertService, useValue: xperts }
            ]
        }).compile()
        await module.init()
        resolve = jest.fn((scope: XpertDataVolumeScope) => {
            const relative =
                scope.catalog === 'user-xperts'
                    ? path.join('user', scope.userId, 'xpert', scope.xpertId)
                    : path.join('xpert', scope.xpertId)
            const directory = path.join(root, scope.tenantId, relative)
            return new VolumeHandle(scope, directory, directory, 'http://localhost/files', root)
        })
        files = new AssistantFilesService(module.get(CommandBus), { createScopedApi: jest.fn() }, { resolve })
        studio = new XpertWorkspaceFilesService(files)
    })

    afterEach(async () => {
        await module?.close()
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })

    it('lets a group-only user collaborate on files while authoring workspace access remains denied', async () => {
        await expect(workspaceAccess.getCapabilities(workspace)).resolves.toMatchObject({
            canRun: true,
            canRead: false,
            canWrite: false,
            canManage: false
        })
        await expect(xperts.findOne(assistant.id)).rejects.toThrow('Access denied to workspace')
        const runtime = files.forRuntime(assistant.id)
        await expect(runtime.list()).resolves.toEqual([])
        await runtime.uploadToFolder('', { originalname: 'result.txt', buffer: Buffer.from('uploaded') })
        await expect(runtime.read('result.txt')).resolves.toMatchObject({ contents: 'uploaded' })
        await runtime.save('result.txt', 'edited')
        const download = await runtime.download('result.txt')
        expect(download.type).toBe('file')
        if (download.type === 'file') {
            expect(await download.fileHandle.readFile('utf8')).toBe('edited')
            await download.fileHandle.close()
        }
        await runtime.delete('result.txt')
        await expect(runtime.list()).resolves.toEqual([])
        await expect(studio.list(assistant.id)).rejects.toThrow(ForbiddenException)
        await expect(runtime.capabilities()).resolves.toEqual({
            canList: true,
            canRead: true,
            canWrite: true,
            canDelete: true
        })
    })

    it('shares the same file between authorized users and keeps user volumes separate', async () => {
        const runtime = files.forRuntime(assistant.id)
        actor = { ...actor, id: 'user-a' }
        await runtime.uploadToFolder('', { originalname: 'shared.txt', buffer: Buffer.from('from A') })
        actor = { ...actor, id: 'user-b' }
        await expect(runtime.read('shared.txt')).resolves.toMatchObject({ contents: 'from A' })
        assistant.workspaceDataScope = 'user'
        actor = { ...actor, id: 'user-a' }
        await runtime.uploadToFolder('', { originalname: 'private.txt', buffer: Buffer.from('A private') })
        actor = { ...actor, id: 'user-b' }
        await expect(runtime.list()).resolves.toEqual([])
        await runtime.uploadToFolder('', { originalname: 'private.txt', buffer: Buffer.from('B private') })
        actor = { ...actor, id: 'user-a' }
        await expect(runtime.read('private.txt')).resolves.toMatchObject({ contents: 'A private' })
    })

    it('does not turn canRun for one workspace into access to every Assistant in it', async () => {
        await expect(workspaceAccess.assertCanRun(workspace.id)).resolves.toBeDefined()
        await expect(files.forRuntime('other-assistant').list()).rejects.toThrow(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
    })

    it.each(['read', 'save', 'delete'] as const)(
        'rechecks a revoked grant before %s and before opening a volume',
        async (operation) => {
            const runtime = files.forRuntime(assistant.id)
            await runtime.uploadToFolder('', { originalname: 'result.txt', buffer: Buffer.from('existing') })
            groupGrant = false
            resolve.mockClear()
            const request =
                operation === 'save' ? runtime.save('result.txt', 'changed') : runtime[operation]('result.txt')
            await expect(request).rejects.toThrow(ForbiddenException)
            expect(resolve).not.toHaveBeenCalled()
        }
    )

    it('allows authoring drafts without silently allowing unpublished runtime access', async () => {
        assistant.publishAt = null
        actor = { ...actor, id: 'user-a' }
        await studio.uploadToFolder(assistant.id, '', { originalname: 'draft.txt', buffer: Buffer.from('draft') })
        await expect(studio.read(assistant.id, 'draft.txt')).resolves.toMatchObject({ contents: 'draft' })
        await expect(files.forRuntime(assistant.id).list()).rejects.toThrow(NotFoundException)
    })

    it.each(['tenant', 'organization'] as const)('rejects another %s before opening a volume', async (scope) => {
        if (scope === 'tenant') actor = { ...actor, tenantId: 'tenant-other' }
        else assistant.organizationId = 'org-other'
        await expect(files.forRuntime(assistant.id).list()).rejects.toThrow()
        expect(resolve).not.toHaveBeenCalled()
    })

    it('revalidates the user group behind a delegated secret without changing general Project delegation', async () => {
        principal = {
            ...actor,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: assistant.id },
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId: assistant.id,
                tenantId: actor.tenantId,
                organizationId: 'org-1'
            }
        } as IApiPrincipal
        const runtime = files.forRuntime(assistant.id)
        await expect(runtime.list()).resolves.toEqual([])
        await expect(studio.list(assistant.id)).rejects.toThrow(ForbiddenException)
        groupGrant = false
        // General Assistant calls still honor a Project-issued delegated audience.
        await expect(published.getAccessiblePublishedXpert(assistant.id)).resolves.toBe(assistant)
        await expect(runtime.list()).rejects.toThrow(ForbiddenException)
        principal.resourceScope = { kind: 'assistant', xpertId: 'other-assistant' }
        groupGrant = true
        await expect(runtime.list()).rejects.toThrow(ForbiddenException)
    })

    it('retains traversal protection in authorized file operations', async () => {
        const runtime = files.forRuntime(assistant.id)
        await expect(runtime.save('../outside.txt', 'escape')).rejects.toThrow()
        await expect(runtime.read('../../outside.txt')).rejects.toThrow()
    })
})
