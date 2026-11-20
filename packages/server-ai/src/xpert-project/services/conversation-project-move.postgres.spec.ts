import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CqrsModule, QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { assertProjectMoveAdmission, ProjectMoveAdmissionHandler } from './project-move-admission'
import { MessageWidgets } from '../../chat-message/widgets/message-widgets'
import { ConversationRuntimeService } from '../../chat-conversation/conversation-runtime'
import { messageWidgetPlaceholder } from '../../chat-message/widgets/message-widget-stream'
import {
    MessageWidgetProvider,
    MessageWidgetProviderRegistry,
    ORGANIZATION_METADATA_KEY,
    PLUGIN_METADATA_KEY,
    ConversationRuntimeCapability,
    createRuntimeCapability,
    DefaultRuntimeCapabilityRegistry,
    type ConversationRuntimeApi,
    StrategyBus
} from '@xpert-ai/plugin-sdk'
import { ChatExecutionAdmissionService } from '../../chat-conversation/chat-execution-admission.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { lastValueFrom, of, toArray } from 'rxjs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { issueProjectSelection, ProjectSelectionService } from './project-selection-request'
import { ConversationProjectMoveService } from './conversation-project-move'

jest.mock('../../chat-conversation/conversation.entity', () => ({ ChatConversation: class ChatConversation {} }))
jest.mock('../../chat-conversation/conversation-thread.entity', () => ({
    ChatConversationThread: class ChatConversationThread {}
}))
jest.mock('../../xpert-agent-execution/agent-execution.entity', () => ({
    XpertAgentExecution: class XpertAgentExecution {}
}))
jest.mock('../project.service', () => ({ XpertProjectService: class {} }))
jest.mock('../../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../../shared/volume/work-area', () => ({ XpertWorkAreaResolver: class {} }))

const suite = process.env.CHAT_CONVERSATION_MOVE_PG_E2E === '1' ? describe : describe.skip
suite('move an existing text conversation at the run boundary', () => {
    const schema = 'move_test_' + randomUUID().replace(/-/g, '')
    const db = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASS ?? 'ocap_password',
        database: process.env.DB_NAME ?? 'ocap',
        extra: { options: '-c search_path=' + schema },
        schema,
        entities: [
            new EntitySchema<ChatConversation>({
                name: 'ChatConversation',
                target: ChatConversation,
                tableName: 'chat_conversation',
                columns: {
                    id: { type: 'uuid', primary: true },
                    tenantId: { type: 'uuid' },
                    organizationId: { type: 'uuid' },
                    createdById: { type: 'uuid' },
                    projectId: { type: 'uuid', nullable: true },
                    xpertId: { type: 'uuid' },
                    purpose: { type: String },
                    options: { type: 'json' },
                    threadId: { type: String }
                }
            }),
            new EntitySchema<XpertAgentExecution>({
                name: 'XpertAgentExecution',
                target: XpertAgentExecution,
                tableName: 'xpert_agent_execution',
                columns: {
                    id: { type: 'uuid', primary: true },
                    createdAt: { type: 'timestamptz', default: () => 'now()' },
                    threadId: { type: String },
                    status: { type: String },
                    tenantId: { type: 'uuid', nullable: true },
                    organizationId: { type: 'uuid', nullable: true },
                    createdById: { type: 'uuid', nullable: true },
                    xpertId: { type: 'uuid', nullable: true },
                    type: { type: String, nullable: true },
                    agentKey: { type: String, nullable: true }
                }
            }),
            new EntitySchema<ChatConversationThread>({
                name: 'ChatConversationThread',
                target: ChatConversationThread,
                tableName: 'chat_conversation_thread',
                columns: {
                    id: { type: 'uuid', primary: true, default: () => 'gen_random_uuid()' },
                    tenantId: { type: 'uuid' },
                    organizationId: { type: 'uuid' },
                    createdById: { type: 'uuid' },
                    conversationId: { type: 'uuid' },
                    threadId: { type: String, unique: true },
                    headMessageId: { type: 'uuid', nullable: true },
                    status: { type: String },
                    runControl: { type: 'json', nullable: true }
                }
            })
        ]
    })
    const user = randomUUID(),
        tenant = randomUUID(),
        org = randomUUID(),
        assistant = randomUUID()
    let actor = user
    const ownedProjects = new Set<string>()
    const projects = {
        findAvailableForXpert: jest.fn(async () => ({ items: [{ id: 'permitted', name: 'Sales' }], total: 1 })),
        assertRuntimeAccess: jest.fn(async (id: string) => {
            if (!ownedProjects.has(id)) throw Error('Project denied')
            return { name: 'Analysis' }
        }),
        ensureDirectProject: jest.fn(async ({ projectId }) => {
            ownedProjects.add(projectId)
        })
    }
    const commands = {
        execute: jest.fn(async (command) => {
            await db.query(
                'INSERT INTO xpert_agent_execution(id,status,"threadId") VALUES ($1,\'running\',$2) ON CONFLICT DO NOTHING',
                [command.options.execution.id, command.options.threadId]
            )
            return of({})
        })
    }
    const service = new ConversationProjectMoveService(
        db,
        projects as never,
        { getAccessiblePublishedXpert: async () => ({ id: assistant }) } as never,
        commands as never,
        {} as never
    )
    const registry = { findByName: (name: string) => (name === 'project.move' ? service : undefined) }
    const widgets = new MessageWidgets(db, registry as never)
    let admissionModule: TestingModule
    async function cardFor(thread: string, id: string) {
        return (await widgets.resolve(thread, [id], true))[0] ?? null
    }
    beforeAll(async () => {
        admissionModule = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [ProjectMoveAdmissionHandler]
        }).compile()
        await admissionModule.init()
        await db.initialize()
        await db.query('CREATE SCHEMA "' + schema + '"')
        await db.synchronize()
        await db.query(`
            CREATE TABLE chat_message (id uuid PRIMARY KEY,"conversationId" uuid,role text,"createdInThreadId" text,content json,"parentId" uuid,"executionId" uuid,sequence int,"followUpStatus" text,"messageEnvelope" json,"thirdPartyMessage" json,"references" json,events json);
            CREATE TABLE conversation_file_link("conversationId" text); CREATE TABLE file_asset("conversationId" text);
            CREATE TABLE chat_conversation_attachment("chatConversationId" uuid); CREATE TABLE chat_message_attachment("chatMessageId" uuid);
            CREATE TABLE chat_message_file_asset("chatMessageId" uuid); CREATE TABLE chat_conversation_goal("conversationId" uuid);
            CREATE TABLE sandbox_managed_service("conversationId" uuid); CREATE TABLE mcp_app_history("conversationId" uuid);
            CREATE TABLE agent_invocation_wait("threadId" text,state text); CREATE TABLE shell_process_execution(binding jsonb);`)
        await db.query(
            readFileSync(join(__dirname, '../migrations/20261119000000-conversation-project-move.sql'), 'utf8')
        )
        await db.query(
            readFileSync(
                join(__dirname, '../../chat-message/widgets/migrations/20261119010000-message-widget-reference.sql'),
                'utf8'
            )
        )
        expect(
            await db.query(
                readFileSync(
                    join(__dirname, '../migrations/checks/20261119000000-conversation-project-move.sql'),
                    'utf8'
                )
            )
        ).toEqual([])
        jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => actor)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(org)
        jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(true)
    })
    afterAll(async () => {
        jest.restoreAllMocks()
        await admissionModule?.close()
        if (db.isInitialized) {
            await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE')
            await db.destroy()
        }
    })
    async function fixture(destination: 'existing' | 'create') {
        actor = user
        const conv = randomUUID(),
            thread = randomUUID(),
            message = randomUUID(),
            ai = randomUUID(),
            run = randomUUID()
        await db.manager.save(ChatConversation, {
            id: conv,
            threadId: thread,
            xpertId: assistant,
            purpose: 'private',
            createdById: user,
            tenantId: tenant,
            organizationId: org,
            options: { projectSelection: { mode: 'none' } }
        })
        await db.manager.save(ChatConversationThread, {
            id: randomUUID(),
            threadId: thread,
            conversationId: conv,
            headMessageId: ai,
            status: 'idle',
            createdById: user,
            tenantId: tenant,
            organizationId: org
        })
        let previous: string | null = null
        for (let sequence = 1; sequence <= 6; sequence++) {
            const id = randomUUID()
            await db.query(
                `INSERT INTO chat_message(id,"conversationId",role,content,"parentId",sequence)
                VALUES ($1,$2,$3,to_json($4::text),$5,$6)`,
                [id, conv, sequence % 2 ? 'human' : 'ai', 'Metric definition ' + sequence, previous, sequence]
            )
            previous = id
        }
        await db.query(
            `INSERT INTO chat_message(id,"conversationId",role,content,"parentId","executionId",sequence) VALUES
          ($1,$3,'human','"Make the dashboard"',$5,NULL,7), ($2,$3,'ai','[{"type":"component","data":{"tool":"DynamicStructuredTool","toolset":"RequestUserInputMiddleware","toolPresentation":"redacted"}},{"type":"text","text":"Choose a project"}]',$1,$4,8)`,
            [message, ai, conv, run, previous]
        )
        await issueProjectSelection(db, {
            conversationId: conv,
            threadId: thread,
            userId: user,
            tenantId: tenant,
            organizationId: org,
            executionId: run,
            inputMessageId: message,
            isStart: true,
            context: { supportsServerWidgetActions: true, supportsProjectSelection: true }
        })
        const offer = await service.pending(thread)
        expect(offer.assistantMessageId).toBe(ai)
        // The chat stream persists this block before the user can confirm the card.
        await db.query('UPDATE chat_message SET content=(content::jsonb || $2::jsonb)::json WHERE id=$1', [
            ai,
            JSON.stringify([
                messageWidgetPlaceholder({
                    messageId: ai,
                    widgetId: offer.requestId,
                    threadId: thread,
                    provider: 'project.move'
                })
            ])
        ])
        const project = randomUUID()
        ownedProjects.add(project)
        return {
            conv,
            thread,
            message,
            run,
            ai,
            project,
            confirm: {
                requestId: offer.requestId,
                moveFromConversationId: conv,
                threadId: thread,
                shareHistory: true,
                target:
                    destination === 'existing'
                        ? { mode: 'existing', projectId: project }
                        : { mode: 'create', name: 'New analysis' }
            }
        }
    }
    it.each(['existing', 'create'] as const)(
        'accepts its persisted inline picker when moving to a %s project',
        async (destination) => {
            const f = await fixture(destination)
            const before = await db.query('SELECT content FROM chat_message WHERE id=$1', [f.ai])
            expect((await cardFor(f.thread, f.ai)).widget.id).toBe(f.confirm.requestId)
            const result = await service.confirm(f.confirm)
            expect((await db.manager.findOneByOrFail(ChatConversation, { id: f.conv })).projectId).toBe(
                result.projectId
            )
            expect(await db.query('SELECT content FROM chat_message WHERE id=$1', [f.ai])).toEqual(before)
            expect(commands.execute.mock.lastCall[0].options.continuation).toEqual({
                sourceMessageId: f.message,
                confirmation: {
                    name: 'workspace_project_confirmation',
                    content: expect.stringContaining(`moved to project ${result.projectId}`)
                }
            })
        }
    )

    it.each(['unissued', 'other-provider', 'other-message'])(
        'rejects a persisted inline picker with a %s reference',
        async (kind) => {
            const f = await fixture('create')
            if (kind === 'unissued')
                await db.query('DELETE FROM chat_message_widget_reference WHERE message_id=$1', [f.ai])
            if (kind === 'other-provider')
                await db.query("UPDATE chat_message_widget_reference SET provider='other.card' WHERE message_id=$1", [
                    f.ai
                ])
            if (kind === 'other-message')
                await db.query('UPDATE chat_message_widget_reference SET message_id=$2 WHERE message_id=$1', [
                    f.ai,
                    f.message
                ])
            const creates = projects.ensureDirectProject.mock.calls.length
            await expect(service.confirm(f.confirm)).rejects.toThrow('Only text conversations')
            expect(projects.ensureDirectProject).toHaveBeenCalledTimes(creates)
            expect((await db.manager.findOneByOrFail(ChatConversation, { id: f.conv })).projectId).toBeNull()
        }
    )

    it('publishes and restores plugin cards from stable references without altering the assistant text', async () => {
        const f = await fixture('existing')
        const original = await db.query('SELECT content FROM chat_message WHERE id=$1', [f.ai])
        const name = '@test/analysis:comparison'
        @MessageWidgetProvider(name)
        class ComparisonCard {
            visibleInRestrictedSessions = true
            resolve = jest.fn(async (refs) =>
                refs.map((ref) => ({
                    messageId: ref.messageId,
                    widget: {
                        id: ref.widgetId,
                        type: 'component',
                        data: {
                            type: 'Widget',
                            category: 'Dashboard',
                            widgets: [{ name: 'choose', serverActions: ['@test/analysis:choose'] }]
                        }
                    }
                }))
            )
        }
        Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@test/analysis', ComparisonCard)
        Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, org, ComparisonCard)
        @Module({ providers: [ComparisonCard] })
        class AnalysisPlugin {}
        const module = await Test.createTestingModule({
            imports: [AnalysisPlugin, DiscoveryModule, CqrsModule],
            providers: [
                StrategyBus,
                MessageWidgetProviderRegistry,
                MessageWidgets,
                ConversationRuntimeService,
                ProjectSelectionService,
                { provide: DataSource, useValue: db }
            ]
        }).compile()
        try {
            await module.init()
            jest.spyOn(module.get(QueryBus), 'execute').mockResolvedValue({ id: f.conv })
            const store = module.get(MessageWidgets)
            const runtime = module.get(ConversationRuntimeService)
            const scope = {
                conversationId: f.conv,
                threadId: f.thread,
                executionId: f.run,
                userId: user,
                tenantId: tenant,
                organizationId: org,
                isStart: true,
                context: { supportsServerWidgetActions: true, supportsProjectSelection: true }
            }
            const registry = new DefaultRuntimeCapabilityRegistry().register(
                ConversationRuntimeCapability,
                runtime.forTurn(scope)
            )
            const publisher = registry.require(createRuntimeCapability<ConversationRuntimeApi>('platform.conversation'))
            const issued = await service.pending(f.thread)
            const selections = module.get(ProjectSelectionService)
            await expect(selections.request({ ...scope, isStart: false })).rejects.toThrow(
                'Project selection unavailable'
            )
            await expect(selections.request({ ...scope, executionId: randomUUID() })).rejects.toThrow()
            expect(Object.keys(publisher)).toEqual(['publishWidget'])
            await selections.request(scope)
            expect((await service.pending(f.thread)).requestId).toBe(issued.requestId)
            const provider = module.get(ComparisonCard)
            const ref = { messageId: f.ai, widgetId: 'comparison', provider: name }
            const publish = () => publisher.publishWidget(provider, ref)
            await Promise.all([publish(), publish()])
            await publisher.publishWidget(provider, { widgetId: ref.widgetId, provider: name })
            await expect(
                runtime
                    .forTurn({ ...scope, executionId: randomUUID() })
                    .publishWidget(provider, { widgetId: ref.widgetId, provider: name })
            ).rejects.toThrow()
            actor = randomUUID()
            await expect(publish()).rejects.toThrow('actor unavailable')
            actor = user
            const read = () => store.resolve(f.thread, [f.ai], true)
            expect((await read()).map((c) => c.widget.id)).toEqual(['comparison'])
            expect((await read()).map((c) => c.widget.id)).toEqual(['comparison'])
            expect(await store.resolve('wrong-thread', [f.ai], true)).toEqual([])
            await expect(publisher.publishWidget(provider, { ...ref, messageId: f.message })).rejects.toThrow()
            await expect(publisher.publishWidget({ ...provider }, ref)).rejects.toThrow()
            provider.visibleInRestrictedSessions = false
            expect(await read()).toEqual([])
            expect(await store.resolve(f.thread, [f.ai], false)).toHaveLength(1)
            module.get(StrategyBus).remove(org, '@test/analysis', 'uninstall')
            expect(await read()).toEqual([])
            await expect(publish()).rejects.toThrow()
            expect(await db.query('SELECT content FROM chat_message WHERE id=$1', [f.ai])).toEqual(original)
        } finally {
            await module.close()
        }
    })

    it('backfills the original message reference for previously issued move receipts on repeat migration', async () => {
        const f = await fixture('create')
        await db.query('DELETE FROM chat_message_widget_reference WHERE message_id=$1', [f.ai])
        expect(await cardFor(f.thread, f.ai)).toBeNull()
        const migration = readFileSync(
            join(__dirname, '../migrations/20261119010100-project-widget-reference.sql'),
            'utf8'
        )
        await db.query(migration)
        await db.query(migration)
        expect((await cardFor(f.thread, f.ai)).widget.id).toBe(f.confirm.requestId)
    })
    it.each(['create', 'existing'] as const)(
        'keeps selected Assistant skills when resuming in a %s Project',
        async (destination) => {
            const f = await fixture(destination)
            const selected = randomUUID()
            const qualified = 'runtime-skill/v1/xpert/' + assistant + '/' + selected
            const projectSkill = 'runtime-skill/v1/project/' + f.project + '/unselected'
            const runtimeCapabilities = {
                mode: 'allowlist',
                skills: { ids: [selected, qualified, projectSkill] },
                plugins: { nodeKeys: ['dashboard'] },
                recommended: { skills: { ids: [selected] } }
            }
            await db.query('UPDATE chat_message SET "thirdPartyMessage"=$2 WHERE id=$1', [
                f.message,
                { runtimeCapabilities }
            ])
            await service.confirm(f.confirm)
            expect(commands.execute.mock.lastCall[0].request.message.input.runtimeCapabilities).toMatchObject({
                mode: 'allowlist',
                skills: { ids: [qualified] },
                plugins: { nodeKeys: ['dashboard'] },
                recommended: { skills: { ids: [qualified] } }
            })
        }
    )

    it('projects the picker only onto its owner’s original reply and recovers its current state', async () => {
        const f = await fixture('existing')
        expect(await cardFor(f.thread, f.message)).toBeNull()
        expect(await cardFor('unrelated', f.ai)).toBeNull()
        actor = randomUUID()
        try {
            expect(await cardFor(f.thread, f.ai)).toBeNull()
        } finally {
            actor = user
        }
        const result = await cardFor(f.thread, f.ai)
        expect(result?.messageId).toBe(f.ai)
        expect(result?.widget).toMatchObject({ type: 'component', id: f.confirm.requestId, data: { type: 'Widget' } })
        expect(JSON.stringify(result)).toContain('permitted')
        expect(JSON.stringify(result)).toContain('project.move.confirm')
        expect(await cardFor(f.thread, f.ai)).toEqual(result)
        await service.confirm(f.confirm)
        const receipt = await cardFor(f.thread, f.ai)
        expect(receipt?.widget.id).toBe(result?.widget.id)
        expect(JSON.stringify(receipt)).not.toMatch(/permitted|project.move.confirm/)
        const cancelled = await fixture('create')
        await service.dismiss(cancelled.thread, cancelled.confirm.requestId)
        expect(await cardFor(cancelled.thread, cancelled.ai)).toBeNull()
    })

    it('binds the chosen mode atomically and rejects a conflicting second confirmation', async () => {
        const f = await fixture('existing')
        const create = { ...f.confirm, target: { mode: 'create', name: 'Switched project' } }
        const first = await service.confirm(create)
        expect((await service.pending(f.thread)).destination).toBe('create')
        expect(await service.confirm(create)).toEqual(first)
        await expect(service.confirm(f.confirm)).rejects.toThrow('already moved')
    })

    it('rejects another tool even when it has the same redacted display name as the project question', async () => {
        const f = await fixture('existing')
        const content = [
            {
                type: 'component',
                data: {
                    tool: 'DynamicStructuredTool',
                    toolset: 'OtherMiddleware',
                    toolPresentation: 'redacted'
                }
            }
        ]
        await db.query('UPDATE chat_message SET content=$2::json WHERE id=$1', [f.ai, JSON.stringify(content)])
        await expect(service.confirm(f.confirm)).rejects.toThrow('Only text conversations')
    })
    it.each(['existing', 'create'] as const)(
        'allows built-in instruction reads persisted after issuing the picker (%s)',
        async (mode) => {
            const f = await fixture(mode)
            const content = [
                { type: 'component', data: { category: 'Tool', tool: 'read_skill_file', toolset: 'skillsMiddleware' } },
                {
                    type: 'component',
                    data: {
                        category: 'Computer',
                        tool: 'read_skill_file',
                        taskSummary: {
                            version: 1,
                            skillUsages: [{ skillId: 'instructions', activation: 'read' }]
                        }
                    }
                },
                {
                    type: 'component',
                    data: {
                        tool: 'DynamicStructuredTool',
                        toolset: 'ProjectMiddleware',
                        toolPresentation: 'redacted'
                    }
                }
            ]
            await db.query('UPDATE chat_message SET content=$2::json,events=$3::json WHERE id=$1', [
                f.ai,
                JSON.stringify(content),
                JSON.stringify([{ tool: 'read_skill_file' }, { tool: 'request_project_selection' }])
            ])
            await service.confirm(f.confirm)
            expect(commands.execute.mock.lastCall[0].options.threadId).toBe(f.thread)
        }
    )
    it.each([
        { category: 'Tool', tool: 'read_skill_file', toolset: 'OtherMiddleware' },
        { category: 'Computer', tool: 'read_skill_file' },
        { category: 'Tool', tool: 'write_file', toolset: 'SandboxFile' }
    ])('rejects unsupported tool records despite a pending picker: %j', async (data) => {
        const f = await fixture('existing')
        await db.query('UPDATE chat_message SET content=$2::json WHERE id=$1', [
            f.ai,
            JSON.stringify([{ type: 'component', data }])
        ])
        await expect(service.confirm(f.confirm)).rejects.toThrow('Only text conversations')
    })
    it.each(['existing', 'create'] as const)(
        'retains the original thread and human input and recovers repeated confirmation (%s)',
        async (mode) => {
            const f = await fixture(mode)
            const before = await db.query(
                'SELECT id,content,"parentId" FROM chat_message WHERE "conversationId"=$1 ORDER BY sequence',
                [f.conv]
            )
            expect(before).toHaveLength(8)
            const result = await service.confirm(f.confirm)
            expect(
                await db.query(
                    'SELECT id,content,"parentId" FROM chat_message WHERE "conversationId"=$1 ORDER BY sequence',
                    [f.conv]
                )
            ).toEqual(before)
            expect(await service.confirm(f.confirm)).toEqual(result)
            expect(commands.execute.mock.lastCall[0].options).toMatchObject({
                threadId: f.thread,
                continuation: { sourceMessageId: f.message },
                once: true
            })
            expect(commands.execute.mock.lastCall[0].request.message.input.input).toBe('Make the dashboard')
            expect(await db.manager.findOneBy(ChatConversation, { id: f.conv })).toMatchObject({
                threadId: f.thread,
                projectId: result.projectId,
                options: { projectSelection: { mode: 'existing' } }
            })
            expect((await service.pending(f.thread)).executionStatus).toBe('running')
        }
    )
    it('keeps the receipt on the original assistant reply after later turns without reauthorizing its button', async () => {
        const f = await fixture('existing')
        const moved = await service.confirm(f.confirm)
        const later = randomUUID()
        await db.query(
            `INSERT INTO chat_message (id,"conversationId",role,content,"parentId","executionId",sequence)
             VALUES ($1,$2,'ai','"Later reply"',$3,$4,9)`,
            [later, f.conv, f.ai, randomUUID()]
        )
        await db.manager.update(ChatConversationThread, { threadId: f.thread }, { headMessageId: later })
        expect(await service.pending(f.thread)).toMatchObject({
            assistantMessageId: f.ai,
            projectId: moved.projectId,
            executionStatus: 'running'
        })
        await expect(service.confirm(f.confirm)).rejects.toThrow('superseded')
    })
    it('recovers a lost startup after creating one project, fences old checkpoints and concurrent writers', async () => {
        const f = await fixture('create')
        await db.query('INSERT INTO xpert_agent_execution(id,status,"threadId") VALUES ($1,\'success\',$2)', [
            f.run,
            f.thread
        ])
        const initial = projects.ensureDirectProject.mock.calls.length
        commands.execute.mockRejectedValueOnce(new Error('transport disconnected before admission'))
        await expect(service.confirm(f.confirm)).rejects.toThrow('transport disconnected')
        const moved = await service.pending(f.thread)
        expect(moved.projectId).toBeTruthy()
        await expect(assertProjectMoveAdmission(db.manager, f.conv)).rejects.toThrow('confirmed project request')
        const [a, b] = await Promise.all([service.confirm(f.confirm), service.confirm(f.confirm)])
        expect(a).toEqual(b)
        expect(a.executionId).toBe(moved.executionId)
        expect(projects.ensureDirectProject.mock.calls).toHaveLength(initial + 1)
        await expect(assertProjectMoveAdmission(db.manager, f.conv, { executionId: f.run })).rejects.toThrow(
            'before it moved'
        )
        await expect(
            assertProjectMoveAdmission(db.manager, f.conv, { executionId: a.executionId })
        ).resolves.toBeUndefined()
    })
    it('admits exactly one model run on concurrent delivery of the same confirmed request', async () => {
        const f = await fixture('existing')
        commands.execute.mockRejectedValueOnce(Error('offline'))
        await expect(service.confirm(f.confirm)).rejects.toThrow('offline')
        const command = commands.execute.mock.lastCall[0]
        const control = { start: jest.fn(), finish: jest.fn() }
        const admission = new ChatExecutionAdmissionService(db, control as never, admissionModule.get(QueryBus))
        const start = jest.fn(async () => of('started'))
        const deliver = async () =>
            lastValueFrom((await admission.run(command.request, command.options, start)).pipe(toArray()))
        const result = await Promise.all([deliver(), deliver()])
        expect(result.flat()).toEqual(['started'])
        expect(start).toHaveBeenCalledTimes(1)
        expect(control.start).toHaveBeenCalledTimes(1)
    })

    it('admits a trusted continuation without a project or project move receipt', async () => {
        const conversationId = randomUUID(),
            threadId = randomUUID(),
            executionId = randomUUID()
        await db.manager.save(ChatConversation, {
            id: conversationId,
            threadId,
            xpertId: assistant,
            purpose: 'private',
            options: {},
            createdById: user,
            tenantId: tenant,
            organizationId: org
        })
        await db.manager.save(ChatConversationThread, {
            id: randomUUID(),
            threadId,
            conversationId,
            status: 'idle',
            createdById: user,
            tenantId: tenant,
            organizationId: org
        })
        const queries = admissionModule.get(QueryBus)
        const projectCheck = jest.spyOn(queries, 'execute')
        try {
            const admission = new ChatExecutionAdmissionService(
                db,
                { start: jest.fn(), finish: jest.fn() } as never,
                queries
            )
            const start = jest.fn(async () => of('continued'))
            const stream = await admission.run(
                {
                    action: 'send',
                    conversationId,
                    message: { input: { input: 'Continue the request' } }
                },
                {
                    threadId,
                    xpertId: assistant,
                    execution: { id: executionId },
                    once: true,
                    continuation: { sourceMessageId: randomUUID(), confirmation: { name: 'context', content: 'Ready' } }
                },
                start
            )
            expect(await lastValueFrom(stream.pipe(toArray()))).toEqual(['continued'])
            expect(start).toHaveBeenCalledTimes(1)
            expect(projectCheck).not.toHaveBeenCalled()
        } finally {
            projectCheck.mockRestore()
        }
    })

    it('requires once-only admission for a continuation without a project', async () => {
        const f = await fixture('existing')
        const admission = new ChatExecutionAdmissionService(
            db,
            { start: jest.fn(), finish: jest.fn() } as never,
            admissionModule.get(QueryBus)
        )
        const start = jest.fn(async () => of('continued'))
        await expect(
            admission.run(
                {
                    action: 'send',
                    conversationId: f.conv,
                    message: { input: { input: 'Continue the request' } }
                },
                {
                    threadId: f.thread,
                    xpertId: assistant,
                    execution: { id: randomUUID() },
                    continuation: { sourceMessageId: f.message, confirmation: { name: 'context', content: 'Ready' } }
                },
                start
            )
        ).rejects.toThrow()
        expect(start).not.toHaveBeenCalled()
    })

    it.each(['source', 'execution'] as const)(
        'rejects a project continuation with the wrong %s receipt',
        async (field) => {
            const f = await fixture('existing')
            commands.execute.mockRejectedValueOnce(Error('offline'))
            await expect(service.confirm(f.confirm)).rejects.toThrow('offline')
            const command = commands.execute.mock.lastCall[0]
            const options = {
                ...command.options,
                ...(field === 'execution'
                    ? { execution: { id: randomUUID() } }
                    : {
                          continuation: { ...command.options.continuation, sourceMessageId: randomUUID() }
                      })
            }
            const admission = new ChatExecutionAdmissionService(
                db,
                { start: jest.fn(), finish: jest.fn() } as never,
                admissionModule.get(QueryBus)
            )
            const start = jest.fn(async () => of('continued'))
            await expect(admission.run(command.request, options, start)).rejects.toThrow()
            expect(start).not.toHaveBeenCalled()
            expect(await db.manager.findOneBy(XpertAgentExecution, { id: options.execution.id })).toBeNull()
        }
    )

    it('dismisses or rejects an inaccessible target without changing the conversation', async () => {
        const f = await fixture('existing')
        await expect(
            service.confirm({ ...f.confirm, target: { mode: 'existing', projectId: randomUUID() } })
        ).rejects.toThrow('Project denied')
        await service.dismiss(f.thread, f.confirm.requestId)
        expect(await service.pending(f.thread)).toBeNull()
        await expect(service.confirm(f.confirm)).rejects.toThrow('superseded')
        expect((await db.manager.findOneBy(ChatConversation, { id: f.conv })).projectId).toBeNull()
    })
    it('rejects an attachment in any branch, a busy sibling, a different owner and a superseded request before provisioning', async () => {
        const f = await fixture('create')
        const initial = projects.ensureDirectProject.mock.calls.length
        await db.query('INSERT INTO file_asset VALUES ($1)', [f.conv])
        await expect(service.confirm(f.confirm)).rejects.toThrow('Only text')
        await db.query('DELETE FROM file_asset WHERE "conversationId"=$1', [f.conv])
        await db.manager.save(ChatConversationThread, {
            id: randomUUID(),
            threadId: randomUUID(),
            conversationId: f.conv,
            headMessageId: f.ai,
            status: 'busy',
            createdById: user,
            tenantId: tenant,
            organizationId: org
        })
        await expect(service.confirm(f.confirm)).rejects.toThrow('active')
        await db.query('UPDATE chat_conversation_thread SET status=\'idle\' WHERE "conversationId"=$1', [f.conv])
        actor = randomUUID()
        await expect(service.confirm(f.confirm)).rejects.toThrow('Forbidden')
        actor = user
        await db.query('UPDATE chat_conversation_thread SET "headMessageId"=$2 WHERE "conversationId"=$1', [
            f.conv,
            randomUUID()
        ])
        await expect(service.confirm(f.confirm)).rejects.toThrow('superseded')
        expect(projects.ensureDirectProject.mock.calls).toHaveLength(initial)
    })
})
