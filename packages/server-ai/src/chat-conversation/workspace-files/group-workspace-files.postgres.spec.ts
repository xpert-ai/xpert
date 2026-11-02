// Real HTTP routes, CQRS group policy, PostgreSQL membership/bindings and temporary-file I/O.
// Passport authentication and unrelated Assistant/Project ACL providers are test doubles.
import { INestApplication, ForbiddenException } from '@nestjs/common'
import { CommandBus, CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IApiPrincipal, SecretTokenBindingType, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Organization, Role, User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource, Repository, EntitySchema } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Queue } from 'bull'
import { WorkbenchFilesController } from '../../ai/workbench-files.controller'
import { WorkbenchFilesAuthGuard } from '../../ai/workbench-files-auth.guard'
import { GroupAccessService } from '../../chat-group/group-access.service'
import { ResolveGroupRuntimeAccessHandler } from '../../chat-group/group-runtime-access.handler'
import { GroupParticipant } from '../../chat-group/group.entity'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { AssistantFileAccessService } from '../../xpert/assistant-files/assistant-file-access.service'
import { XpertService } from '../../xpert/xpert.service'
import { VolumeClient, VolumeHandle, VolumeScope } from '../../shared/volume'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationService } from '../conversation.service'
import type { ChatConversationReadState } from '../conversation-read-state.entity'
import type { ChatMessageService } from '../../chat-message/chat-message.service'
import type { ChatConversationThreadService } from '../conversation-thread.service'
import { ConversationEnvironmentFilesModule } from './conversation-environment-files.module'
import { AssertUserXpertGrantQuery } from '../../../../server/src/secret-token/assert-user-xpert-grant.query'

jest.mock('../../chat-message/chat-message.service', () => ({ ChatMessageService: class {} }))
jest.mock('../../copilot-store', () => ({ CreateCopilotStoreCommand: class {} }))
jest.mock('../../xpert-agent-execution/queries', () => ({
    FindAgentExecutionsQuery: class {},
    XpertAgentExecutionStateQuery: class {}
}))
jest.mock('../dto', () => ({ ChatConversationPublicDTO: class {} }))
jest.mock('../conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../xpert/xpert.service', () => ({ XpertService: class {} }))

class AuthenticatedFilesGuard extends WorkbenchFilesAuthGuard {
    protected override authenticateClientSecret() {
        return true
    }
}

// Authentication is a fixture; domain file access must still reject this Assistant-only audience.
@QueryHandler(AssertUserXpertGrantQuery)
class FixtureAssistantGrantHandler {
    async execute() {}
}

const id = { type: 'uuid' as const, primary: true, generated: 'uuid' as const }
const uuid = { type: 'uuid' as const, nullable: true }
const text = { type: 'varchar' as const, nullable: true }
const scopeColumns = { tenantId: uuid, organizationId: uuid }
const groupFileTestEntities = [
    new EntitySchema({ name: 'Role', target: Role, columns: { id, name: text } }),
    new EntitySchema({
        name: 'Organization',
        target: Organization,
        columns: { id, isActive: { type: 'boolean', default: true } }
    }),
    new EntitySchema<User>({
        name: 'User',
        target: User,
        columns: { id, tenantId: uuid, type: text },
        relations: { role: { type: 'many-to-one', target: 'Role', joinColumn: true } }
    }),
    new EntitySchema<UserOrganization>({
        name: 'UserOrganization',
        target: UserOrganization,
        columns: { id, ...scopeColumns, userId: uuid, isActive: { type: 'boolean', default: true } },
        relations: {
            organization: { type: 'many-to-one', target: 'Organization', joinColumn: { name: 'organizationId' } }
        }
    }),
    new EntitySchema({
        name: 'ChatConversation',
        target: ChatConversation,
        columns: {
            id,
            ...scopeColumns,
            createdById: uuid,
            xpertId: uuid,
            projectId: uuid,
            threadId: uuid,
            options: { type: 'jsonb', nullable: true },
            purpose: text
        }
    }),
    new EntitySchema({
        name: 'GroupParticipant',
        target: GroupParticipant,
        columns: {
            id,
            ...scopeColumns,
            groupId: uuid,
            subjectId: uuid,
            kind: text,
            role: text,
            runtimeConversationId: uuid,
            runtimeThreadId: uuid,
            active: { type: 'boolean', default: true }
        }
    })
]

const postgres = process.env.GROUP_TEST_DATABASE_URL ? describe : describe.skip
postgres('group Workbench file HTTP authorization with PostgreSQL', () => {
    const schema = `group_files_${randomUUID().replace(/-/g, '')}`
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    const userId = randomUUID(),
        creatorId = randomUUID(),
        outsiderId = randomUUID(),
        assistantId = randomUUID()
    let db: DataSource, app: INestApplication, origin: string, root: string
    let group: ChatConversation, runtime: ChatConversation, participant: GroupParticipant
    let principal: IApiPrincipal
    let ordinaryLogin = false
    let files: ChatConversationService
    const published = {
        getAccessiblePublishedXpert: jest.fn(),
        getAccessiblePublishedXpertForCurrentUser: jest.fn()
    }
    const projects = {
        assertCanUseXpert: jest.fn(),
        assertCanRead: jest.fn(),
        assertCanUse: jest.fn(),
        assertCanEdit: jest.fn()
    }
    const resolveVolume = jest.fn(
        (volumeScope: VolumeScope) => new VolumeHandle(volumeScope, root, root, 'http://localhost/test-volume')
    )
    const volumes: VolumeClient = { resolve: resolveVolume, resolveRoot: () => ({ serverRoot: root, hostRoot: root }) }
    const endpoint = (id = runtime.id) => `${origin}/api/ai/conversations/${id}/workspace`
    const request = (route: string, init?: RequestInit, id = runtime.id) =>
        fetch(`${endpoint(id)}/${route}`, {
            ...init,
            headers: { 'x-client-secret': 'cs-x-test-only', ...init?.headers }
        })
    const save = (content = 'updated') =>
        request('file', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: 'report.txt', content })
        })
    const upload = () => {
        const body = new FormData()
        body.append('path', '')
        body.append('file', new Blob(['upload']), 'upload.txt')
        return request('file/upload', { method: 'POST', body })
    }
    const operations = [
        ['list', () => request('files?path=')],
        ['read', () => request('file?path=report.txt')],
        ['download', () => request('file/download?path=report.txt')],
        ['write', () => save()],
        ['upload', () => upload()],
        ['delete', () => request('file?path=report.txt', { method: 'DELETE' })]
    ] as const

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'group-workbench-files-'))
        db = await new DataSource({
            type: 'postgres',
            url: process.env.GROUP_TEST_DATABASE_URL,
            schema,
            entities: groupFileTestEntities
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        const module = await Test.createTestingModule({
            imports: [CqrsModule, ConversationEnvironmentFilesModule],
            controllers: [WorkbenchFilesController],
            providers: [
                FixtureAssistantGrantHandler,
                GroupAccessService,
                ResolveGroupRuntimeAccessHandler,
                AssistantFileAccessService,
                { provide: DataSource, useValue: db },
                { provide: getRepositoryToken(ChatConversation), useValue: db.getRepository(ChatConversation) },
                { provide: PublishedXpertAccessService, useValue: published },
                { provide: XpertProjectAccessService, useValue: projects },
                { provide: XpertService, useValue: {} },
                {
                    provide: ChatConversationService,
                    inject: [CommandBus, QueryBus],
                    useFactory: (commands: CommandBus, queries: QueryBus) =>
                        new ChatConversationService(
                            db.getRepository(ChatConversation),
                            {} as Repository<ChatConversationReadState>,
                            {} as ChatMessageService,
                            commands,
                            queries,
                            {} as Queue,
                            volumes,
                            projects as unknown as XpertProjectAccessService,
                            {} as ChatConversationThreadService
                        )
                }
            ]
        })
            .overrideGuard(WorkbenchFilesAuthGuard)
            .useFactory({
                inject: [Reflector, CommandBus, QueryBus],
                factory: (reflector: Reflector, commands: CommandBus, queries: QueryBus) =>
                    new AuthenticatedFilesGuard(reflector, db.getRepository(ChatConversation), commands, queries)
            })
            .compile()
        files = module.get(ChatConversationService)
        // Use the fixture's minimal schema, retaining exact tenant/org predicates and real SQL results.
        jest.spyOn(files, 'findOneInOrganizationOrTenant').mockImplementation((id: string) =>
            db.getRepository(ChatConversation).findOneBy({
                id,
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId()
            })
        )
        app = module.createNestApplication({ logger: false })
        app.use((req: { user?: { id?: string; tenantId?: string } }, _res: unknown, next: () => void) => {
            req.user = ordinaryLogin ? { id: userId, tenantId: scope.tenantId } : principal
            next()
        })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
        await db.getRepository(Organization).save({ id: scope.organizationId, isActive: true })
        for (const id of [userId, creatorId, outsiderId]) {
            await db.getRepository(User).save({ id, tenantId: scope.tenantId, type: UserType.USER })
            await db.getRepository(UserOrganization).save({ ...scope, userId: id, isActive: true })
        }
    }, 60000)

    beforeEach(async () => {
        await db.getRepository(GroupParticipant).clear()
        await db.getRepository(ChatConversation).clear()
        await db.getRepository(Organization).update(scope.organizationId, { isActive: true })
        await db.getRepository(UserOrganization).update({ ...scope }, { isActive: true })
        group = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'group', xpertId: assistantId, createdById: creatorId })
        runtime = await db.getRepository(ChatConversation).save({
            ...scope,
            purpose: 'group_assistant_runtime',
            xpertId: assistantId,
            createdById: creatorId,
            threadId: randomUUID()
        })
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId: group.id, kind: 'user', subjectId: userId, role: 'member', active: true })
        participant = await db.getRepository(GroupParticipant).save({
            ...scope,
            groupId: group.id,
            kind: 'assistant',
            subjectId: assistantId,
            runtimeConversationId: runtime.id,
            runtimeThreadId: runtime.threadId,
            active: true
        })
        ordinaryLogin = false
        principal = {
            id: userId,
            ...scope,
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION,
            requestedOrganizationId: scope.organizationId,
            resourceScope: { kind: 'conversation', conversationId: group.id },
            clientSecretExpiresAt: new Date(Date.now() + 60000)
        }
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => principal.id)
        jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => principal.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockImplementation(() => principal.requestedOrganizationId)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockImplementation(() => (ordinaryLogin ? null : principal))
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(undefined)
        const assistant = { id: assistantId, tenantId: scope.tenantId, workspaceDataScope: 'shared' }
        published.getAccessiblePublishedXpert.mockReset().mockResolvedValue(assistant)
        published.getAccessiblePublishedXpertForCurrentUser.mockReset().mockResolvedValue(assistant)
        for (const mock of Object.values(projects)) mock.mockReset().mockResolvedValue({ role: 'member' })
        resolveVolume.mockClear()
        await writeFile(join(root, 'report.txt'), 'original')
    })
    afterEach(() => {
        // Keep the scoped SQL finder installed for the suite.
        for (const name of [
            'currentUserId',
            'currentTenantId',
            'getOrganizationId',
            'currentApiPrincipal',
            'currentApiKey'
        ] as const)
            jest.mocked(RequestContext[name]).mockRestore()
    })
    afterAll(async () => {
        await app?.close()
        jest.restoreAllMocks()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
        if (root) await rm(root, { recursive: true, force: true })
    })

    it('serves list, text, binary download, save, upload and delete for an invited active member', async () => {
        const list = await request('files?path=')
        expect(list.status).toBe(200)
        expect(await list.json()).toEqual(expect.arrayContaining([expect.objectContaining({ filePath: 'report.txt' })]))
        const read = await request('file?path=report.txt')
        expect(read.status).toBe(200)
        expect(await read.json()).toMatchObject({
            contents: 'original',
            capabilities: { canRead: true, canWrite: true }
        })
        const download = await request('file/download?path=report.txt')
        expect(download.status).toBe(200)
        expect(await download.text()).toBe('original')
        expect((await save()).status).toBe(200)
        expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('updated')
        expect((await upload()).status).toBe(201)
        expect(await readFile(join(root, 'upload.txt'), 'utf8')).toBe('upload')
        expect((await request('file?path=report.txt', { method: 'DELETE' })).status).toBe(200)
        await expect(readFile(join(root, 'report.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
        expect(resolveVolume).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: scope.tenantId, xpertId: assistantId, userId })
        )
        expect(principal.resourceScope).toEqual({ kind: 'conversation', conversationId: group.id })
    })

    it('allows an ordinary authenticated group member without broadening ordinary conversation access', async () => {
        ordinaryLogin = true
        expect((await request('files')).status).toBe(200)
        expect((await save()).status).toBe(200)
        await expect(files.assertAccess(runtime.id)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it.each(operations)(
        'rechecks revoked group membership before %s and does not touch storage',
        async (_name, operation) => {
            expect((await request('files')).status).toBe(200)
            await db.getRepository(GroupParticipant).update({ groupId: group.id, subjectId: userId }, { active: false })
            resolveVolume.mockClear()
            expect((await operation()).status).toBe(403)
            expect(resolveVolume).not.toHaveBeenCalled()
            expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('original')
        }
    )

    it.each([
        'assistantCredential',
        'publicCredential',
        'malformedAudience',
        'nonMember',
        'organizationMembership',
        'organization',
        'assistantMembership',
        'crossGroupCredential',
        'runtimeCredential',
        'expired',
        'tenant',
        'organizationScope',
        'threadBinding',
        'assistantBinding',
        'runtimePurpose'
    ] as const)('rejects %s for every file entry point', async (condition) => {
        if (condition === 'assistantCredential' || condition === 'publicCredential') {
            principal.clientSecretBindingType =
                condition === 'assistantCredential'
                    ? SecretTokenBindingType.USER_XPERT
                    : SecretTokenBindingType.PUBLIC_XPERT
            principal.resourceScope = { kind: 'assistant', xpertId: assistantId }
        }
        if (condition === 'malformedAudience') principal.resourceScope = undefined
        if (condition === 'nonMember') principal.id = outsiderId
        if (condition === 'organizationMembership')
            await db.getRepository(UserOrganization).update({ ...scope, userId }, { isActive: false })
        if (condition === 'organization')
            await db.getRepository(Organization).update(scope.organizationId, { isActive: false })
        if (condition === 'assistantMembership')
            await db.getRepository(GroupParticipant).update(participant.id, { active: false })
        if (condition === 'crossGroupCredential')
            principal.resourceScope = { kind: 'conversation', conversationId: randomUUID() }
        if (condition === 'runtimeCredential')
            principal.resourceScope = { kind: 'conversation', conversationId: runtime.id }
        if (condition === 'expired') principal.clientSecretExpiresAt = new Date(0)
        if (condition === 'tenant') principal.tenantId = randomUUID()
        if (condition === 'organizationScope') principal.requestedOrganizationId = randomUUID()
        if (condition === 'threadBinding')
            await db.getRepository(ChatConversation).update(runtime.id, { threadId: randomUUID() })
        if (condition === 'assistantBinding')
            await db.getRepository(ChatConversation).update(runtime.id, { xpertId: randomUUID() })
        if (condition === 'runtimePurpose')
            await db.getRepository(ChatConversation).update(runtime.id, { purpose: 'private' })
        for (const [, operation] of operations)
            expect((await operation()).status).toBe(condition === 'expired' ? 401 : 403)
        expect(resolveVolume).not.toHaveBeenCalled()
    })

    it('rejects another persisted group runtime, an unbound runtime and ordinary conversation IDs', async () => {
        const otherGroup = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'group', xpertId: assistantId })
        const otherRuntime = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'group_assistant_runtime', xpertId: assistantId, threadId: randomUUID() })
        await db.getRepository(GroupParticipant).save({
            ...scope,
            groupId: otherGroup.id,
            kind: 'assistant',
            active: true,
            subjectId: assistantId,
            runtimeConversationId: otherRuntime.id,
            runtimeThreadId: otherRuntime.threadId
        })
        await db
            .getRepository(GroupParticipant)
            .save({ ...scope, groupId: otherGroup.id, kind: 'user', active: true, subjectId: userId, role: 'member' })
        const unbound = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'group_assistant_runtime', xpertId: assistantId })
        const ordinary = await db
            .getRepository(ChatConversation)
            .save({ ...scope, purpose: 'private', xpertId: assistantId, createdById: userId })
        for (const id of [otherRuntime.id, unbound.id, ordinary.id, group.id])
            expect((await request('files', undefined, id)).status).toBe(403)
        expect(resolveVolume).not.toHaveBeenCalled()
    })

    it('also reauthorizes direct file business calls after membership revocation', async () => {
        await files.getWorkspaceFiles(runtime.id)
        await db.getRepository(GroupParticipant).update({ groupId: group.id, subjectId: userId }, { active: false })
        resolveVolume.mockClear()
        const calls = [
            () => files.getWorkspaceFiles(runtime.id),
            () => files.readWorkspaceFile(runtime.id, 'report.txt'),
            () => files.getWorkspaceFileDownload(runtime.id, 'report.txt'),
            () => files.saveWorkspaceFile(runtime.id, 'report.txt', 'bad'),
            () => files.uploadWorkspaceFile(runtime.id, '', { originalname: 'bad.txt', buffer: Buffer.from('bad') }),
            () => files.deleteWorkspaceFile(runtime.id, 'report.txt')
        ]
        for (const operation of calls) await expect(operation()).rejects.toBeInstanceOf(ForbiddenException)
        expect(resolveVolume).not.toHaveBeenCalled()
    })

    it.each([false, true])('denies unverified group environment references (ordinary login: %s)', async (login) => {
        ordinaryLogin = login
        for (const environmentId of [randomUUID(), randomUUID()]) {
            await db.getRepository(ChatConversation).update(runtime.id, {
                options: { sandboxEnvironmentId: environmentId }
            })
            for (const [, operation] of operations) expect((await operation()).status).toBe(403)
        }
        expect(resolveVolume).not.toHaveBeenCalled()
        expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('original')
    })

    it('denies direct file calls when an environment reference appears after Assistant file access', async () => {
        await files.getWorkspaceFiles(runtime.id)
        await db.getRepository(ChatConversation).update(runtime.id, {
            options: { sandboxEnvironmentId: randomUUID() }
        })
        resolveVolume.mockClear()
        for (const operation of [
            () => files.getWorkspaceFiles(runtime.id),
            () => files.readWorkspaceFile(runtime.id, 'report.txt'),
            () => files.getWorkspaceFileDownload(runtime.id, 'report.txt'),
            () => files.saveWorkspaceFile(runtime.id, 'report.txt', 'bad'),
            () => files.uploadWorkspaceFile(runtime.id, '', { originalname: 'bad.txt', buffer: Buffer.from('bad') }),
            () => files.deleteWorkspaceFile(runtime.id, 'report.txt')
        ])
            await expect(operation()).rejects.toBeInstanceOf(ForbiddenException)
        expect(resolveVolume).not.toHaveBeenCalled()
        expect(await readFile(join(root, 'report.txt'), 'utf8')).toBe('original')
    })

    it('retains ordinary conversation/attachment denial and file containment', async () => {
        await expect(files.assertAccess(runtime.id)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(files.getAttachments(runtime.id)).rejects.toBeInstanceOf(ForbiddenException)
        expect((await request('file?path=..%2Foutside.txt')).status).toBe(400)
        const outside = join(root, '..', `outside-${randomUUID()}.txt`)
        await writeFile(outside, 'private')
        try {
            await symlink(outside, join(root, 'link.txt'))
            expect((await request('file?path=link.txt')).status).toBe(400)
        } finally {
            await rm(outside, { force: true })
            await rm(join(root, 'link.txt'), { force: true })
        }
    })

    it('retains live Assistant file ACL and Project write restrictions', async () => {
        published.getAccessiblePublishedXpertForCurrentUser.mockRejectedValue(new ForbiddenException())
        for (const [, operation] of operations) expect((await operation()).status).toBe(403)
        expect(resolveVolume).not.toHaveBeenCalled()
        published.getAccessiblePublishedXpertForCurrentUser.mockResolvedValue({
            id: assistantId,
            tenantId: scope.tenantId
        })
        await db.getRepository(ChatConversation).update(runtime.id, {
            projectId: randomUUID(),
            options: { sandboxEnvironmentId: randomUUID() }
        })
        projects.assertCanEdit.mockRejectedValue(new ForbiddenException())
        expect((await request('files')).status).toBe(200)
        const read = await request('file?path=report.txt')
        expect(await read.json()).toMatchObject({ capabilities: { canRead: true, canWrite: false } })
        expect((await save()).status).toBe(403)
        expect((await upload()).status).toBe(403)
        expect((await request('file?path=report.txt', { method: 'DELETE' })).status).toBe(403)
    })
})
