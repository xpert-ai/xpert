import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import {
    ApiKeyBindingType,
    IApiPrincipal,
    IUser,
    RolesEnum,
    SecretTokenBindingType,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FindOneOptions, Repository } from 'typeorm'
import { VolumeHandle, VolumeSubtreeClient, XpertDataVolumeScope } from '../../shared/volume'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { Xpert } from '../xpert.entity'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceFilesService } from '../xpert-workspace-files.service'
import { AssistantFileAccessService } from './assistant-file-access.service'
import { AssistantFilesService } from './assistant-files.service'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AssistantWorkspaceScopeHandler } from './assistant-workspace-scope.handler'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { XpertWorkAreaResolver } from '../../shared/volume/work-area'
import { XpertWorkAreaExtensionRegistry } from '../../shared/volume/work-area-extension.registry'
import { FileAssetAccessService } from '../../file-understanding/file-asset-access.service'
import { CreateWorkspaceFileAssetHandler } from '../../file-understanding/commands/handlers/create-workspace-file-asset.handler'
import { CreateWorkspaceFileAssetCommand } from '../../file-understanding/commands/create-workspace-file-asset.command'
import { ReadFileAssetSourceHandler } from '../../file-understanding/queries/handlers/read-file-asset-source.handler'
import { ReadFileAssetSourceQuery } from '../../file-understanding/queries/read-file-asset-source.query'
import { ResolveAuthorizedFileAssetQuery } from '../../file-understanding/queries/resolve-authorized-file-asset.query'
import { FileAsset } from '../../file-understanding/entities'
import { FileWorkspaceProjectionService } from '../../file-understanding/file-workspace-projection.service'
import {
    resolveFileAssetWorkspaceRelativePath,
    resolveFileAssetWorkspaceVolumeScope
} from '../../file-understanding/domain/workspace-file'

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
            let principalUserId: string | undefined
            const capture = (_condition: unknown, parameters?: { id?: string; userId?: string }) => {
                if (parameters?.id) requestedId = parameters.id
                if (parameters?.userId) principalUserId = parameters.userId
                return builder
            }
            const builder = {
                leftJoin: jest.fn().mockReturnThis(),
                innerJoin: jest.fn().mockReturnThis(),
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                getOne: jest.fn(async () =>
                    principalUserId === assistant.userId && actor.tenantId === assistant.tenantId
                        ? Object.assign(new Xpert(), {
                              ...assistant,
                              createdBy: {
                                  id: assistant.createdById,
                                  tenantId: assistant.tenantId,
                                  type: UserType.USER
                              }
                          })
                        : null
                ),
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
                AssistantWorkspaceScopeHandler,
                { provide: getRepositoryToken(Xpert), useValue: repository },
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
        files = new AssistantFilesService(module.get(CommandBus), { resolve })
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

    it('lets an Assistant technical account read and update its creator workspace without changing the actor', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        const runtime = files.forRuntime(assistant.id)
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await runtime.uploadToFolder('', { originalname: 'code.py', buffer: Buffer.from('original') })
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        await expect(runtime.read('code.py')).resolves.toMatchObject({ contents: 'original' })
        await runtime.save('code.py', 'updated by technical account')
        expect(RequestContext.currentUserId()).toBe('assistant-tech')
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await expect(runtime.read('code.py')).resolves.toMatchObject({ contents: 'updated by technical account' })
        actor = { ...actor, id: 'user-b' }
        await expect(runtime.list()).resolves.toEqual([])
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

    it('mounts the creator files in the technical-account sandbox and preserves separate conversation directories', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        const runtime = files.forRuntime(assistant.id)
        await runtime.uploadToFolder('saic', { originalname: 'code.py', buffer: Buffer.from('existing code') })
        const workAreas = new XpertWorkAreaResolver(
            { resolve } as never,
            {
                mapVolumeToWorkspace: (_provider: string, volume: VolumeHandle, options?: { serverPath?: string }) => ({
                    volumeRoot: volume.serverRoot,
                    workspaceRoot: volume.serverRoot,
                    workspacePath: options?.serverPath ? volume.path(options.serverPath) : volume.serverRoot
                })
            } as never,
            new XpertWorkAreaExtensionRegistry(),
            module.get(CommandBus)
        )
        const scope = { tenantId: actor.tenantId, xpertId: assistant.id, workspaceDataScope: 'user' as const }
        const human = await workAreas.resolve({ ...scope, userId: actor.id, conversationId: 'human-thread' })
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        const technical = await workAreas.resolve({ ...scope, userId: actor.id, conversationId: 'technical-thread' })
        expect(technical.workingDirectory).toBe(human.workingDirectory)
        expect(technical.sessionPath.serverPath).not.toBe(human.sessionPath.serverPath)
        await expect(readFile(path.join(technical.workingDirectory, 'saic/code.py'), 'utf8')).resolves.toBe(
            'existing code'
        )
        await writeFile(path.join(technical.workingDirectory, 'saic/code.py'), 'sandbox update')
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await expect(runtime.read('saic/code.py')).resolves.toMatchObject({ contents: 'sandbox update' })
    })

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

    const application = (actor: IUser, assistantId: string) => ({
        tenantId: actor.tenantId,
        organizationId: 'org-1',
        userId: actor.id,
        xpertId: assistantId
    })

    it('shares new file assets with the creator while retaining legacy technical-account files and denying other users', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await files
            .forRuntime(assistant.id)
            .uploadToFolder('', { originalname: 'note.txt', buffer: Buffer.from('new bytes') })
        let asset: FileAsset
        const repository = {
            create: (input: Partial<FileAsset>) => Object.assign(new FileAsset(), input),
            save: async (input: FileAsset) =>
                (asset = Object.assign(input, { id: '8d70766b-c87b-465e-b06c-c900eb18f79a' })),
            findOne: async () => asset
        }
        const access = new FileAssetAccessService(
            repository as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            published,
            module.get(CommandBus)
        )
        const registration = new CreateWorkspaceFileAssetHandler(
            repository as never,
            {} as never,
            { resolve } as never,
            module.get(CommandBus),
            access
        )
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        const registered = await registration.execute(
            new CreateWorkspaceFileAssetCommand({
                ...application(actor, assistant.id),
                catalog: 'user-xperts',
                filePath: 'note.txt',
                parseMode: 'none'
            })
        )
        expect(registered.userId).toBe('user-a')
        expect(RequestContext.currentUserId()).toBe('assistant-tech')
        const reader = new ReadFileAssetSourceHandler(access, { resolve })
        const query = new ReadFileAssetSourceQuery(registered.id, { kind: 'current-owner' })
        await expect(reader.execute(query)).resolves.toEqual(Buffer.from('new bytes'))
        const runtimeFiles = new WorkspaceFilesRuntimeCapabilityService(
            module.get(CommandBus),
            { resolve },
            new DefaultRuntimeCapabilityRegistry(),
            { execute: async (query: ResolveAuthorizedFileAssetQuery) => access.resolve(query.input) } as never
        )
        const result = await runtimeFiles
            .createScopedApi(application(actor, assistant.id))
            .readRuntimeBuffer(registered.id)
        expect(result.buffer.toString()).toBe('new bytes')
        expect(result.reference.userId).toBe('user-a')
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await expect(reader.execute(query)).resolves.toEqual(Buffer.from('new bytes'))

        // Old references still identify their original volume even if the creator has a same-named file.
        const legacy = await resolve({
            tenantId: actor.tenantId,
            catalog: 'user-xperts',
            userId: 'assistant-tech',
            xpertId: assistant.id
        }).ensureRoot()
        await writeFile(legacy.path('note.txt'), 'legacy bytes')
        asset.userId = 'assistant-tech'
        await expect(reader.execute(query)).rejects.toThrow(ForbiddenException)
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        await expect(reader.execute(query)).resolves.toEqual(Buffer.from('legacy bytes'))
        actor = { ...actor, id: 'user-b', type: UserType.USER }
        await expect(reader.execute(query)).rejects.toThrow(ForbiddenException)
    })

    const createFiles = () =>
        new WorkspaceFilesRuntimeCapabilityService(
            module.get(CommandBus),
            { resolve },
            new DefaultRuntimeCapabilityRegistry(),
            { execute: jest.fn().mockResolvedValue('meetings') }
        )
    const privateApp = { pluginName: '@xpert-ai/plugin-meetings', requireUserIsolation: true }

    it('shares runtime file references and plugin app data with the creator across technical-account API keys', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await files
            .forRuntime(assistant.id)
            .uploadToFolder('', { originalname: 'code.py', buffer: Buffer.from('code') })
        const humanFiles = createFiles().createScopedApi(application(actor, assistant.id))
        await humanFiles.appData(privateApp).write('state.json', 'human state')
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        for (const keyOwner of ['user-a', 'another-key-creator']) {
            principal = { ...actor, principalType: 'api_key', ownerUserId: keyOwner } as IApiPrincipal
            const technicalFiles = createFiles().createScopedApi(application(actor, assistant.id))
            const reference = await technicalFiles.resolveRuntimeReference('code.py')
            expect(reference.userId).toBe('user-a')
            await expect(technicalFiles.readRuntimeBuffer(reference)).resolves.toMatchObject({
                buffer: Buffer.from('code')
            })
            await expect(technicalFiles.appData(privateApp).read('state.json')).resolves.toEqual(
                Buffer.from('human state')
            )
            expect(RequestContext.currentUserId()).toBe('assistant-tech')
        }
        actor = { ...actor, id: 'user-b', type: UserType.USER }
        principal = null
        await expect(
            createFiles().readBuffer({ ...application(actor, assistant.id), userId: 'user-a', filePath: 'code.py' })
        ).rejects.toThrow(ForbiddenException)
    })

    it('stores application state in the same user Assistant volume across independent API instances', async () => {
        assistant.workspaceDataScope = 'user'
        const first = createFiles()
        const second = createFiles()
        const a = first.createScopedApi(application(actor, assistant.id)).appData(privateApp)
        const b = second.createScopedApi(application(actor, assistant.id)).appData(privateApp)
        await a.write('records/meeting/meeting.json', '{"revision":1}')
        await expect(b.read('records/meeting/meeting.json')).resolves.toEqual(Buffer.from('{"revision":1}'))
        await expect(
            files.forRuntime(assistant.id).read('.apps/meetings/records/meeting/meeting.json')
        ).rejects.toThrow(ForbiddenException)
        const writes = await Promise.allSettled(
            [a, b].map((store) =>
                store.withLock('meeting', async () => {
                    const state = JSON.parse((await store.read('records/meeting/meeting.json')).toString())
                    if (state.revision !== 1) throw new Error('revision_conflict')
                    await store.write('records/meeting/meeting.json', '{"revision":2}')
                })
            )
        )
        expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(writes.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect((await b.read('records/meeting/meeting.json')).toString()).toBe('{"revision":2}')
    })

    it('isolates application storage by actor and rejects shared workspaces and stale bindings', async () => {
        const service = createFiles()
        const alice = service.createScopedApi(application(actor, assistant.id)).appData(privateApp)
        await expect(alice.write('secret', 'private')).rejects.toMatchObject({
            response: { code: 'assistant_user_workspace_required' }
        })
        expect(resolve).not.toHaveBeenCalled()
        assistant.workspaceDataScope = 'user'
        await alice.write('secret', 'private')
        actor = { ...actor, id: 'user-a' }
        await expect(alice.read('secret')).rejects.toThrow(ForbiddenException)
        const bob = service.createScopedApi(application(actor, assistant.id)).appData(privateApp)
        await expect(bob.read('secret')).rejects.toMatchObject({ code: 'ENOENT' })
        await expect(files.forRuntime(assistant.id).read('.apps/meetings/secret')).rejects.toThrow(ForbiddenException)
        await expect(
            service.createScopedApi(application(actor, 'other-assistant')).appData(privateApp).read('secret')
        ).rejects.toThrow()
        await expect(
            service
                .createScopedApi({ ...application(actor, assistant.id), tenantId: 'other' })
                .appData(privateApp)
                .read('secret')
        ).rejects.toThrow()
        await expect(
            service
                .createScopedApi({ ...application(actor, assistant.id), organizationId: 'other' })
                .appData(privateApp)
                .read('secret')
        ).rejects.toThrow()
    })

    it('revalidates application access after revocation and after switching the Assistant to shared mode', async () => {
        assistant.workspaceDataScope = 'user'
        const service = createFiles()
        const storage = service.createScopedApi(application(actor, assistant.id)).appData(privateApp)
        await storage.write('secret', 'private')
        groupGrant = false
        resolve.mockClear()
        await expect(storage.read('secret')).rejects.toThrow(ForbiddenException)
        await expect(storage.write('secret', 'changed')).rejects.toThrow(ForbiddenException)
        await expect(storage.remove('secret')).rejects.toThrow(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
        groupGrant = true
        assistant.workspaceDataScope = 'shared'
        await expect(storage.read('secret')).rejects.toMatchObject({
            response: { code: 'assistant_user_workspace_required' }
        })
    })
    it('supports shared app data by policy and reauthorizes ordinary runtime file access', async () => {
        const service = createFiles()
        const app = service.createScopedApi(application(actor, assistant.id)).appData({ pluginName: 'shared_app' })
        await app.write('state', 'collaborative')
        actor = { ...actor, id: 'user-c' }
        const other = service.createScopedApi(application(actor, assistant.id)).appData({ pluginName: 'shared_app' })
        await expect(other.read('state')).resolves.toEqual(Buffer.from('collaborative'))
        await files
            .forRuntime(assistant.id)
            .uploadToFolder('visible', { originalname: 'a.txt', buffer: Buffer.from('ok') })
        const runtime = service.createScopedApi(application(actor, assistant.id))
        await expect(runtime.readRuntimeBuffer('/workspace/visible/a.txt')).resolves.toMatchObject({
            buffer: Buffer.from('ok')
        })
        groupGrant = false
        await expect(runtime.readRuntimeBuffer('/workspace/visible/a.txt')).rejects.toThrow(ForbiddenException)
        await expect(runtime.deleteFile({ filePath: 'visible/a.txt' })).rejects.toThrow(ForbiddenException)
    })

    it('never redirects private file projections into a newly shared Assistant workspace', async () => {
        assistant.workspaceDataScope = 'user'
        const service = createFiles()
        const privateFiles = service.createScopedApi({
            ...application(actor, assistant.id),
            catalog: 'user-xperts',
            isolateByUser: true
        })
        assistant.workspaceDataScope = 'shared'
        resolve.mockClear()
        await expect(
            privateFiles.writeRuntimeBuffer({
                path: '/workspace/meetings/notes.md',
                buffer: Buffer.from('private notes')
            })
        ).rejects.toThrow(ForbiddenException)
        await expect(privateFiles.readRuntimeBuffer('/workspace/meetings/notes.md')).rejects.toThrow(ForbiddenException)
        await expect(privateFiles.deleteFile({ filePath: 'meetings/notes.md' })).rejects.toThrow(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
    })

    it('uploads Studio drafts with authoring authority without falling back from runtime', async () => {
        groupGrant = false
        actor = { ...actor, id: 'user-a' }
        assistant.publishAt = null
        const studio = files.forAuthoring(assistant.id)
        const file = {
            originalname: 'draft.txt',
            buffer: Buffer.from('draft'),
            mimetype: 'text/plain'
        } as Express.Multer.File
        const reference = await studio.upload(file)
        await expect(studio.read(reference.filePath)).resolves.toMatchObject({ contents: 'draft' })
        await expect(files.forRuntime(assistant.id).upload(file)).rejects.toThrow(NotFoundException)
    })
    it('returns the owner workspace reference for a newly written runtime file', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        const service = createFiles()
        jest.spyOn(service, 'uploadBuffer').mockImplementation(async (input) => {
            await files
                .forRuntime(assistant.id)
                .uploadToFolder('', { originalname: 'result.txt', buffer: input.buffer })
            return {
                name: 'result.txt',
                filePath: 'result.txt',
                workspacePath: 'result.txt',
                catalog: 'user-xperts',
                scopeId: assistant.id
            }
        })
        const runtime = service.createScopedApi(application(actor, assistant.id))
        const written = await runtime.writeRuntimeBuffer({
            path: '/workspace/result.txt',
            buffer: Buffer.from('result')
        })
        expect(written.reference.userId).toBe('user-a')
        await expect(runtime.readRuntimeBuffer(written.reference)).resolves.toMatchObject({
            buffer: Buffer.from('result')
        })
        expect(RequestContext.currentUserId()).toBe('assistant-tech')
    })

    it('preserves the physical owner in an existing portable reference', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        for (const [userId, contents] of [
            ['assistant-tech', 'ORIGINAL-TECHNICAL'],
            ['user-a', 'DIFFERENT-HUMAN']
        ]) {
            const volume = await resolve({
                tenantId: actor.tenantId,
                catalog: 'user-xperts',
                userId,
                xpertId: assistant.id
            }).ensureRoot()
            await writeFile(volume.path('report.txt'), contents)
        }
        const runtime = createFiles().createScopedApi({
            ...application(actor, assistant.id),
            catalog: 'user-xperts',
            scopeId: assistant.id,
            isolateByUser: true
        })
        const oldReference = {
            ...application(actor, assistant.id),
            source: 'platform.workspace.files' as const,
            catalog: 'user-xperts' as const,
            scopeId: assistant.id,
            filePath: 'report.txt'
        }
        const read = await runtime.readRuntimeBuffer(oldReference)
        expect(read.buffer.toString()).toBe('ORIGINAL-TECHNICAL')
        actor = { ...actor, id: 'user-a', type: UserType.USER }
        await expect(
            createFiles().createScopedApi(application(actor, assistant.id)).readRuntimeBuffer(oldReference)
        ).rejects.toThrow()
    })

    it.each(['fileAssetId', 'storageFileId'] as const)(
        'reads a historical attachment by %s from its original volume',
        async (locator) => {
            assistant.workspaceDataScope = 'user'
            assistant.userId = 'assistant-tech'
            actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
            for (const [userId, contents] of [
                ['assistant-tech', 'ORIGINAL-TECHNICAL'],
                ['user-a', 'DIFFERENT-HUMAN']
            ]) {
                const volume = await resolve({
                    tenantId: actor.tenantId,
                    catalog: 'user-xperts',
                    userId,
                    xpertId: assistant.id
                }).ensureRoot()
                await writeFile(volume.path('report.txt'), contents)
            }
            const asset = Object.assign(new FileAsset(), {
                id: '8d70766b-c87b-465e-b06c-c900eb18f79a',
                storageFileId: '36d672e4-063d-4e75-89ca-b39ca14588f1',
                tenantId: actor.tenantId,
                organizationId: 'org-1',
                userId: actor.id,
                createdById: actor.id,
                xpertId: assistant.id,
                workspacePath: 'report.txt',
                metadata: { workspace: { catalog: 'user-xperts', scopeId: assistant.id, relativePath: 'report.txt' } }
            })
            const access = new FileAssetAccessService(
                {
                    findOne: async ({ where }: FindOneOptions<FileAsset>) =>
                        where &&
                        !Array.isArray(where) &&
                        (where.id === asset.id || where.storageFileId === asset.storageFileId)
                            ? asset
                            : null
                } as never,
                {} as never,
                {
                    findOneInOrganizationOrTenant: async () => ({
                        id: asset.storageFileId,
                        tenantId: asset.tenantId,
                        organizationId: asset.organizationId,
                        createdById: asset.createdById
                    })
                } as never,
                {} as never,
                {} as never,
                published,
                module.get(CommandBus)
            )
            const service = new WorkspaceFilesRuntimeCapabilityService(
                module.get(CommandBus),
                { resolve },
                new DefaultRuntimeCapabilityRegistry(),
                { execute: async (query: ResolveAuthorizedFileAssetQuery) => access.resolve(query.input) } as never
            )
            const id = locator === 'fileAssetId' ? asset.id : asset.storageFileId
            for (const scope of [
                application(actor, assistant.id),
                { ...application(actor, assistant.id), catalog: 'user-xperts' as const, isolateByUser: true }
            ]) {
                const result = await service.createScopedApi(scope).readRuntimeBuffer(id)
                expect(result.buffer.toString()).toBe('ORIGINAL-TECHNICAL')
                expect(result.reference.userId).toBe('assistant-tech')
            }
            actor = { ...actor, id: 'user-a', type: UserType.USER }
            await expect(
                service.createScopedApi(application(actor, assistant.id)).readRuntimeBuffer(id)
            ).rejects.toThrow()
            expect(asset.userId).toBe('assistant-tech')
        }
    )

    it('preserves the source and edits to a historical attachment copy', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.userId = 'assistant-tech'
        actor = { ...actor, id: 'assistant-tech', type: UserType.COMMUNICATION }
        for (const [userId, contents] of [
            ['assistant-tech', 'ORIGINAL-TECHNICAL'],
            ['user-a', 'DIFFERENT-HUMAN']
        ]) {
            const volume = await resolve({
                tenantId: actor.tenantId,
                catalog: 'user-xperts',
                userId,
                xpertId: assistant.id
            }).ensureRoot()
            await writeFile(volume.path('report.txt'), contents)
        }
        const asset = Object.assign(new FileAsset(), {
            id: 'old-asset',
            tenantId: actor.tenantId,
            organizationId: 'org-1',
            userId: actor.id,
            createdById: actor.id,
            xpertId: assistant.id,
            conversationId: 'technical-conversation',
            originalName: 'report.txt',
            workspacePath: 'report.txt',
            metadata: { workspace: { catalog: 'user-xperts', scopeId: assistant.id, relativePath: 'report.txt' } }
        })
        const workAreas = new XpertWorkAreaResolver(
            { resolve } as never,
            {
                mapVolumeToWorkspace: (_provider: string, volume: VolumeHandle, options?: { serverPath?: string }) => ({
                    volumeRoot: volume.serverRoot,
                    workspaceRoot: volume.serverRoot,
                    workspacePath: options?.serverPath ? volume.path(options.serverPath) : volume.serverRoot
                })
            } as never,
            new XpertWorkAreaExtensionRegistry(),
            module.get(CommandBus)
        )
        const projection = new FileWorkspaceProjectionService(
            { save: async (input: FileAsset) => input } as never,
            { find: async () => [] } as never,
            {
                resolve: async () => ({
                    asset,
                    conversation: {
                        id: asset.conversationId,
                        tenantId: actor.tenantId,
                        organizationId: 'org-1',
                        xpertId: assistant.id,
                        xpert: assistant,
                        createdById: actor.id
                    }
                })
            } as never,
            { assertCanEdit: jest.fn() } as never,
            { resolve } as never,
            workAreas
        )
        const projected = await projection.projectFileAsset({
            fileAssetId: asset.id,
            conversationId: asset.conversationId
        })
        const volumeScope = resolveFileAssetWorkspaceVolumeScope(projected)
        const filePath = resolveFileAssetWorkspaceRelativePath(projected)
        const projectedVolume = new VolumeSubtreeClient(resolve(volumeScope as XpertDataVolumeScope), {
            allowRootWorkspace: true
        })
        expect((await projectedVolume.readBuffer('', filePath)).toString()).toBe('ORIGINAL-TECHNICAL')
        expect(projected.userId).toBe('assistant-tech')
        expect(projected.metadata.workspace).toEqual({
            catalog: 'user-xperts',
            scopeId: assistant.id,
            relativePath: 'report.txt'
        })
        const ownerVolume = new VolumeSubtreeClient(
            resolve({ tenantId: actor.tenantId, catalog: 'user-xperts', userId: 'user-a', xpertId: assistant.id }),
            { allowRootWorkspace: true }
        )
        expect((await ownerVolume.readBuffer('', 'report.txt')).toString()).toBe('DIFFERENT-HUMAN')
        expect(
            (await ownerVolume.readBuffer('', 'sessions/technical-conversation/files/old-asset/report.txt')).toString()
        ).toBe('ORIGINAL-TECHNICAL')
        const copyPath = 'sessions/technical-conversation/files/old-asset/report.txt'
        await ownerVolume.saveFile('', copyPath, 'TECHNICAL-EDIT')
        await projection.projectFileAsset({ fileAssetId: asset.id, conversationId: asset.conversationId })
        await projection.projectFileAsset({
            fileAssetId: asset.id,
            conversationId: asset.conversationId,
            operation: 'parse'
        })
        expect((await ownerVolume.readBuffer('', copyPath)).toString()).toBe('TECHNICAL-EDIT')
        expect((await projectedVolume.readBuffer('', filePath)).toString()).toBe('ORIGINAL-TECHNICAL')
        expect(projected.userId).toBe('assistant-tech')
        expect(resolveFileAssetWorkspaceRelativePath(projected)).toBe('report.txt')

        await ownerVolume.deleteFile('', copyPath)
        await projection.projectFileAsset({ fileAssetId: asset.id, conversationId: asset.conversationId })
        expect((await ownerVolume.readBuffer('', copyPath)).toString()).toBe('ORIGINAL-TECHNICAL')
    })
})
