// Real HTTP -> CQRS -> scoped thread/conversation repositories -> actor policy.
// Only credential verification and downstream run/control projections are isolated.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { createNamespace, getNamespace } from 'cls-hooked'
import { INestApplication, ServiceUnavailableException } from '@nestjs/common'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { DataSource, EntitySchema } from 'typeorm'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { RequestContext, RequestContextMiddleware, runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { publication, principal } from '../../mcp-publication/testing/fixtures'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { ChatConversationThreadService } from '../../chat-conversation/conversation-thread.service'
import { AssertChatConversationAccessHandler } from '../../chat-conversation/queries/handlers/conversation-assert-access.handler'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { ReadThreadControlViewQuery } from '../../chat-conversation/control-view/read-thread-control-view.query'
import { ThreadRecoveryService } from '../../chat-conversation/recovery/thread-recovery.service'
import { FindAgentExecutionsQuery, GetThreadContextUsageQuery } from '../../xpert-agent-execution'
import { RedisSseStreamService } from '../../shared/stream/redis-sse.service'
import { AiService } from '../ai.service'
import { ThreadsController } from '../thread.controller'
import { ThreadRecoveryController } from '../thread-recovery/thread-recovery.controller'
import { FindThreadHandler } from '../queries/handlers/thread-find.handler'
import { ThreadActivityService } from './thread-activity.service'
import { IsPublishedXpertInFamilyQuery } from '../../xpert/queries'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const scope = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
const tenantRelation = { type: 'many-to-one' as const, target: 'AccessTestTenant', joinColumn: { name: 'tenantId' } }

integration('child-thread HTTP access and activity error semantics', () => {
    let database: { db: DataSource; close: () => Promise<void> }
    let app: INestApplication, endpoint: string, bus: QueryBus
    const tenantId = publication().tenantId,
        organizationId = publication().organizationId
    const owner = principal().subjectId
    const outsider = '10000000-0000-4000-8000-000000000008'
    const source = randomUUID(),
        branch = randomUUID(),
        conversationId = randomUUID(),
        xpertId = randomUUID()
    let actor: string, org: string, tenant: string
    const snapshot = jest.fn(),
        returnToSource = jest.fn()

    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
        const schema = `thread_access_${randomUUID().replace(/-/g, '')}`
        const db = await new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [
                new EntitySchema({ name: 'AccessTestTenant', columns: { id: { ...uuid, primary: true } } }),
                new EntitySchema({
                    name: 'AccessTestXpert',
                    columns: { id: { ...uuid, primary: true }, createdById: uuid, userId: uuid }
                }),
                new EntitySchema<ChatConversation>({
                    name: 'ChatConversation',
                    target: ChatConversation,
                    tableName: 'chat_conversation',
                    columns: {
                        ...scope,
                        threadId: text,
                        createdById: uuid,
                        xpertId: uuid,
                        purpose: text,
                        status: text
                    },
                    relations: {
                        tenant: tenantRelation,
                        xpert: { type: 'many-to-one', target: 'AccessTestXpert', joinColumn: { name: 'xpertId' } }
                    }
                }),
                new EntitySchema<ChatConversationThread>({
                    name: 'ChatConversationThread',
                    target: ChatConversationThread,
                    tableName: 'chat_conversation_thread',
                    columns: {
                        ...scope,
                        threadId: text,
                        conversationId: uuid,
                        parentThreadId: { ...text, nullable: true },
                        status: text,
                        metadata: { type: 'jsonb' },
                        createdAt: { type: 'timestamptz', createDate: true },
                        updatedAt: { type: 'timestamptz', updateDate: true }
                    },
                    relations: {
                        tenant: tenantRelation,
                        conversation: {
                            type: 'many-to-one',
                            target: 'ChatConversation',
                            joinColumn: { name: 'conversationId' }
                        }
                    }
                })
            ]
        }).initialize()
        database = {
            db,
            close: async () => {
                await db.query(`DROP SCHEMA "${schema}" CASCADE`)
                await db.destroy()
            }
        }
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        await db.manager.insert('AccessTestTenant', { id: tenantId })
        await db.manager.insert('AccessTestXpert', { id: xpertId, createdById: outsider, userId: outsider })
        await db.manager.insert(ChatConversation, {
            id: conversationId,
            tenantId,
            organizationId,
            threadId: source,
            createdById: owner,
            xpertId,
            status: 'idle',
            purpose: 'private'
        })
        for (const threadId of [source, branch])
            await db.manager.insert(ChatConversationThread, {
                id: randomUUID(),
                tenantId,
                organizationId,
                conversationId,
                threadId,
                parentThreadId: threadId === branch ? source : null,
                status: 'idle',
                metadata: { primary: threadId === source, ...(threadId === branch ? { purpose: 'side-chat' } : {}) }
            })
        const threads = new ChatConversationThreadService(
            db.getRepository(ChatConversationThread),
            undefined,
            db.getRepository(ChatConversation),
            db,
            undefined,
            undefined
        )
        const conversations = new ChatConversationService(
            db.getRepository(ChatConversation),
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            threads
        )
        const module = await Test.createTestingModule({
            imports: [CqrsModule.forRoot()],
            controllers: [ThreadsController, ThreadRecoveryController],
            providers: [
                AssertChatConversationAccessHandler,
                FindThreadHandler,
                { provide: ChatConversationService, useValue: conversations },
                { provide: ChatConversationThreadService, useValue: threads },
                { provide: AiService, useValue: {} },
                { provide: RedisSseStreamService, useValue: {} },
                { provide: ThreadActivityService, useValue: { snapshot } },
                { provide: ThreadRecoveryService, useValue: { getSourceThreadId: async () => source, returnToSource } }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({ canActivate: () => true })
            .compile()
        bus = module.get(QueryBus)
        const execute = bus.execute.bind(bus)
        jest.spyOn(bus, 'execute').mockImplementation(async (query: object) => {
            if (query instanceof IsPublishedXpertInFamilyQuery) return false
            if (query instanceof FindAgentExecutionsQuery) return { items: [] }
            if (query instanceof GetThreadContextUsageQuery) return { status: 'unavailable' }
            if (query instanceof ReadThreadControlViewQuery)
                return {
                    thread: await threads.requireByThreadId(query.threadId),
                    controlView: { version: 1, threadId: query.threadId, state: 'idle', actions: { canSend: true } }
                }
            return execute(query)
        })
        app = module.createNestApplication({ logger: false })
        app.use((req, res, next) => {
            req.user = { id: actor, tenantId: tenant }
            req.headers['organization-id'] = org
            const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
            namespace.run(() => {
                namespace.set('RequestContext', { request: req })
                new RequestContextMiddleware().use(req, res, next)
            })
        })
        app.setGlobalPrefix('api/ai')
        await app.listen(0, '127.0.0.1')
        endpoint = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/ai/threads`
    }, 30_000)
    beforeEach(async () => {
        actor = owner
        org = organizationId
        tenant = tenantId
        await database.db.manager.update(ChatConversation, conversationId, { createdById: owner })
        snapshot.mockReset().mockImplementation(async (_conversation, threadId: string) => ({
            version: 1,
            threadId,
            runs: [],
            cards: []
        }))
        returnToSource.mockReset()
    })
    afterAll(async () => {
        await app?.close()
        await database?.close()
        jest.restoreAllMocks()
    })

    async function nextEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
        let text = ''
        while (!text.includes('data:')) {
            const chunk = await reader.read()
            if (chunk.done) break
            text += new TextDecoder().decode(chunk.value)
        }
        return text
    }

    it.each([source, branch])('opens metadata, runs, control view, usage and live updates for %s', async (threadId) => {
        for (const suffix of ['', '/runs', '/context-usage', '/control-view', '/capabilities']) {
            expect((await fetch(`${endpoint}/${threadId}${suffix}`)).status).toBe(200)
        }
        const response = await fetch(`${endpoint}/${threadId}/stream`, { signal: AbortSignal.timeout(5000) })
        expect(response.status).toBe(200)
        const reader = response.body.getReader()
        expect(await nextEvent(reader)).toContain(`"threadId":"${threadId}"`)
        await reader.cancel()
    })
    it.each(['actor', 'organization', 'tenant', 'missing'] as const)(
        'rejects %s before opening SSE or reading projections',
        async (kind) => {
            if (kind === 'actor') actor = outsider
            if (kind === 'organization') org = randomUUID()
            if (kind === 'tenant') tenant = randomUUID()
            const threadId = kind === 'missing' ? randomUUID() : branch
            for (const suffix of ['/runs', '/control-view', '/context-usage', '/stream']) {
                const response = await fetch(`${endpoint}/${threadId}${suffix}`)
                expect(response.status).toBe(kind === 'actor' ? 403 : 404)
                expect(await response.text()).not.toContain('event:')
            }
            expect(snapshot).not.toHaveBeenCalled()
        }
    )
    it('retains the Assistant audience restriction on a valid child thread', async () => {
        const principalSpy = jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT,
            resourceScope: { kind: 'assistant', xpertId: randomUUID() }
        } as never)
        // The same actor may own other conversations; a credential still cannot cross its Assistant audience.
        try {
            expect((await fetch(`${endpoint}/${branch}/stream`)).status).toBe(403)
            expect(snapshot).not.toHaveBeenCalled()
        } finally {
            principalSpy.mockRestore()
        }
    })
    it.each([{ id: randomUUID() }, { createdById: outsider }])(
        'preserves caller constraints while resolving a branch: %j',
        async (conditions) => {
            const namespace = getNamespace('RequestContext') ?? createNamespace('RequestContext')
            await new Promise<void>((resolve, reject) => {
                const request = { user: { id: owner, tenantId }, headers: { 'organization-id': organizationId } }
                namespace.run(() => {
                    namespace.set('RequestContext', { request })
                    runWithRequestContext(request as never, {}, () => {
                        expect(bus.execute(new AssertChatConversationAccessQuery({ threadId: branch, ...conditions })))
                            .rejects.toMatchObject({ status: 404 })
                            .then(resolve, reject)
                    })
                })
            })
        }
    )
    it('keeps contribute authorization on recovery from a child thread', async () => {
        actor = outsider
        expect((await fetch(`${endpoint}/${branch}/recovery/source`, { method: 'POST' })).status).toBe(403)
        expect(returnToSource).not.toHaveBeenCalled()
    })
    it('reports revocation after the first snapshot as structured SSE 403 and closes', async () => {
        const response = await fetch(`${endpoint}/${branch}/stream`, { signal: AbortSignal.timeout(6000) })
        const reader = response.body.getReader()
        expect(await nextEvent(reader)).toContain('event: thread.snapshot')
        await database.db.manager.update(ChatConversation, conversationId, { createdById: outsider })
        const error = await nextEvent(reader)
        expect(error).toContain('event: error')
        expect(error).toContain('"status":403')
        expect((await reader.read()).done).toBe(true)
        expect(snapshot).toHaveBeenCalledTimes(1)
    }, 10_000)
    it.each([new ServiceUnavailableException('temporary outage'), new Error('private database details')])(
        'retains retryable status and sanitizes unknown errors',
        async (failure) => {
            snapshot.mockRejectedValueOnce(failure)
            const response = await fetch(`${endpoint}/${branch}/stream`, { signal: AbortSignal.timeout(5000) })
            const body = await response.text()
            expect(response.status).toBe(200)
            expect(body).toContain('event: error')
            expect(body).toContain(`"status":${failure instanceof ServiceUnavailableException ? 503 : 500}`)
            expect(body).not.toContain('private database details')
        }
    )
})
