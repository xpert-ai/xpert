import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import {
    ApiKeyBindingType,
    IApiPrincipal,
    IUser,
    RolesEnum,
    SecretTokenBindingType,
    templateManifestSchema,
    type TemplateAgentSource
} from '@xpert-ai/contracts'
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
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import {
    AuthorizeTemplateExecutionCommand,
    AuthorizeTemplateExecutionHandler
} from '../../agent-plugin/templates/resolve-template-execution.command'
import type { RuntimeResourceService } from '../../agent-plugin/runtime-resource.service'

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

    it.each(['shared', 'user'] as const)(
        'initializes %s template files through the real group ACL and current user scope',
        async (scope) => {
            assistant.workspaceDataScope = scope
            assistant.options = {
                templateSource: {
                    templateId: 'fixture',
                    templateKey: 'fixture',
                    manifest: templateManifestSchema.parse({
                        schemaVersion: 1,
                        version: '1',
                        files: {
                            scope,
                            entries: [
                                {
                                    kind: 'file',
                                    path: 'welcome.md',
                                    content: 'seed',
                                    contentVersion: '1',
                                    policy: 'create-only'
                                }
                            ]
                        }
                    })
                }
            }
            const runtime = files.forRuntime(assistant.id)
            await expect(runtime.read('welcome.md')).resolves.toMatchObject({ contents: 'seed' })
            await runtime.save('welcome.md', 'user-b edit')
            actor = { ...actor, id: 'user-a' }
            await expect(runtime.read('welcome.md')).resolves.toMatchObject({
                contents: scope === 'user' ? 'seed' : 'user-b edit'
            })
            actor = { ...actor, id: 'user-b' }
            await expect(runtime.read('welcome.md')).resolves.toMatchObject({ contents: 'user-b edit' })
            groupGrant = false
            resolve.mockClear()
            await expect(runtime.read('welcome.md')).rejects.toThrow(ForbiddenException)
            expect(resolve).not.toHaveBeenCalled()
        }
    )

    it('denies initial file creation before a revoked user can provision their volume', async () => {
        assistant.workspaceDataScope = 'user'
        assistant.options = {
            templateSource: {
                templateId: 'fixture',
                templateKey: 'fixture',
                manifest: templateManifestSchema.parse({
                    schemaVersion: 1,
                    version: '1',
                    files: { scope: 'user', entries: [{ kind: 'directory', path: 'initial' }] }
                })
            }
        }
        groupGrant = false
        await expect(files.forRuntime(assistant.id).list()).rejects.toThrow(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
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

    function templateAuthority() {
        const source: TemplateAgentSource = {
            kind: 'agent_plugin_template',
            bindingId: 'package-binding',
            version: 'version-one',
            digest: 'digest-one',
            packageName: 'reviewers',
            templateKey: 'reviewer'
        }
        const resources = { resolve: jest.fn(async () => ({ templates: [source] })) }
        const queries = { execute: jest.fn(async () => ({ agent: { team: assistant } })) }
        const handler = new AuthorizeTemplateExecutionHandler(
            resources as unknown as RuntimeResourceService,
            queries as unknown as QueryBus,
            module.get(CommandBus)
        )
        const authorize = (requested = source, assistantId = assistant.id) =>
            handler.execute(
                new AuthorizeTemplateExecutionCommand(
                    assistantId,
                    { revision: 1, resources: [{ bindingId: source.bindingId, version: source.version }] },
                    requested
                )
            )
        return { authorize, source, resources, queries }
    }

    it('reauthorizes template delegation and cached replay against the live delegated user grant', async () => {
        await expect(workspaceAccess.assertCanAuthor(workspace.id)).rejects.toThrow(ForbiddenException)
        principal = {
            ...actor,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: assistant.id }
        } as IApiPrincipal
        const task = templateAuthority()
        await expect(task.authorize()).resolves.toBe(assistant)
        groupGrant = false
        // The immutable session audience alone still passes ordinary metadata access.
        await expect(published.getAccessiblePublishedXpert(assistant.id)).resolves.toBe(assistant)
        task.resources.resolve.mockClear()
        task.queries.execute.mockClear()
        await expect(task.authorize()).rejects.toThrow(ForbiddenException)
        expect(task.resources.resolve).not.toHaveBeenCalled()
        expect(task.queries.execute).not.toHaveBeenCalled()
        expect(resolve).not.toHaveBeenCalled()
    })

    it.each(['tenant', 'organization', 'assistant', 'unpublished'] as const)(
        'rejects template delegation with a mismatched %s authority before resource preparation',
        async (scope) => {
            const task = templateAuthority()
            if (scope === 'tenant') actor = { ...actor, tenantId: 'tenant-other' }
            if (scope === 'organization') assistant.organizationId = 'org-other'
            if (scope === 'unpublished') assistant.publishAt = null
            await expect(
                task.authorize(task.source, scope === 'assistant' ? 'other-assistant' : assistant.id)
            ).rejects.toThrow()
            expect(task.resources.resolve).not.toHaveBeenCalled()
            expect(task.queries.execute).not.toHaveBeenCalled()
        }
    )

    it.each(['bindingId', 'version', 'digest', 'packageName', 'templateKey'] as const)(
        'rejects a forged template %s even with valid Assistant access',
        async (field) => {
            const task = templateAuthority()
            await expect(task.authorize({ ...task.source, [field]: 'forged' })).rejects.toThrow()
            expect(task.queries.execute).not.toHaveBeenCalled()
        }
    )

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

    const createFiles = () =>
        new WorkspaceFilesRuntimeCapabilityService(
            module.get(CommandBus),
            { resolve },
            new DefaultRuntimeCapabilityRegistry(),
            { execute: jest.fn().mockResolvedValue('meetings') }
        )
    const privateApp = { pluginName: '@xpert-ai/plugin-meetings', requireUserIsolation: true }

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
})
