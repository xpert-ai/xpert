import { DataSource, EntitySchema, type QueryRunner } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { MembershipLedgerSourceEnum, executionObservationQuerySchema } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../agent-execution.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ExecutionObservationService } from './observation.service'
import { ObservationAccessService } from './observation-access.service'
import { ObservationUsageService } from './observation-usage.service'

const postgres = process.env.EXECUTION_OBSERVABILITY_PG_E2E === '1' ? describe : describe.skip
const shared = { tenantId: { type: 'uuid' as const }, organizationId: { type: 'uuid' as const } }
const schemas = [
    new EntitySchema<XpertAgentExecution>({
        name: 'ObservationExecutionFixture',
        target: XpertAgentExecution,
        tableName: 'observation_execution_fixture',
        columns: {
            ...shared,
            id: { type: 'uuid', primary: true },
            xpertId: { type: 'uuid', nullable: true },
            parentId: { type: 'uuid', nullable: true },
            threadId: { type: String, nullable: true },
            title: { type: String, nullable: true },
            status: { type: String, nullable: true },
            metadata: { type: 'jsonb', nullable: true },
            createdById: { type: 'uuid', nullable: true },
            createdAt: { type: 'timestamptz' },
            completedAt: { type: 'timestamptz', nullable: true },
            elapsedTime: { type: 'double precision', nullable: true },
            error: { type: String, nullable: true }
        }
    }),
    new EntitySchema<Xpert>({
        name: 'ObservationAssistantFixture',
        target: Xpert,
        tableName: 'observation_assistant_fixture',
        columns: {
            ...shared,
            deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
            id: { type: 'uuid', primary: true },
            name: { type: String },
            title: { type: String, nullable: true },
            avatar: { type: 'json', nullable: true },
            workspaceId: { type: 'uuid', nullable: true }
        }
    }),
    new EntitySchema<XpertWorkspace>({
        name: 'ObservationWorkspaceFixture',
        target: XpertWorkspace,
        tableName: 'observation_workspace_fixture',
        columns: { ...shared, id: { type: 'uuid', primary: true }, name: { type: String } }
    }),
    new EntitySchema<ChatConversation>({
        name: 'ObservationConversationFixture',
        target: ChatConversation,
        tableName: 'observation_conversation_fixture',
        columns: { ...shared, id: { type: 'uuid', primary: true }, from: { type: String, nullable: true } }
    }),
    new EntitySchema<ChatConversationThread>({
        name: 'ObservationThreadFixture',
        target: ChatConversationThread,
        tableName: 'observation_thread_fixture',
        columns: {
            ...shared,
            id: { type: 'uuid', primary: true },
            threadId: { type: String },
            conversationId: { type: 'uuid' },
            parentThreadId: { type: String, nullable: true },
            forkedFromMessageId: { type: 'uuid', nullable: true }
        }
    }),
    new EntitySchema<MembershipPointLedger>({
        name: 'ObservationLedgerFixture',
        target: MembershipPointLedger,
        tableName: 'observation_ledger_fixture',
        columns: {
            ...shared,
            organizationId: { type: String },
            id: { type: 'uuid', primary: true },
            originExecutionId: { type: 'uuid' },
            source: { type: String },
            recordedAt: { type: 'timestamptz' },
            totalTokens: { type: 'bigint', nullable: true },
            pricingStatus: { type: String, nullable: true },
            priceCurrency: { type: String, nullable: true },
            priceAmount: { type: 'numeric', nullable: true }
        }
    })
]
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const tenant = uuid(1),
    organization = uuid(2),
    user = uuid(3),
    assistant = uuid(4),
    workspace = uuid(5),
    conversation = uuid(6)
const at = (minute: number) => new Date(Date.parse('2026-10-26T02:00:00Z') + minute * 60000).toISOString()
const input = executionObservationQuerySchema.parse({ from: at(0), to: at(45), asOf: at(45), pageSize: 2 })

postgres('execution observability PostgreSQL contract (connection-local fixtures only)', () => {
    let db: DataSource, runner: QueryRunner, service: ExecutionObservationService
    let usage: ObservationUsageService
    let api: ReturnType<ExecutionObservationService['createScopedApi']>
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            entities: schemas,
            synchronize: false,
            migrationsRun: false,
            installExtensions: false
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // TEMP tables disappear with this connection. No stored platform table is created, modified or cleared.
        const common = '"tenantId" uuid, "organizationId" uuid'
        await runner.query(
            `CREATE TEMP TABLE observation_execution_fixture (id uuid PRIMARY KEY, ${common}, "xpertId" uuid, "parentId" uuid, "threadId" text, title text, status text, metadata jsonb, "createdById" uuid, "createdAt" timestamptz, "completedAt" timestamptz, "elapsedTime" double precision, error text)`
        )
        await runner.query(
            `CREATE TEMP TABLE observation_assistant_fixture (id uuid PRIMARY KEY, ${common}, "deletedAt" timestamptz, name text, title text, avatar json, "workspaceId" uuid)`
        )
        await runner.query(
            `CREATE TEMP TABLE observation_workspace_fixture (id uuid PRIMARY KEY, ${common}, name text)`
        )
        await runner.query(
            `CREATE TEMP TABLE observation_conversation_fixture (id uuid PRIMARY KEY, ${common}, "from" text)`
        )
        await runner.query(
            `CREATE TEMP TABLE observation_thread_fixture (id uuid PRIMARY KEY, ${common}, "threadId" text UNIQUE, "conversationId" uuid, "parentThreadId" text, "forkedFromMessageId" uuid)`
        )
        await runner.query(
            `CREATE TEMP TABLE observation_ledger_fixture (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" varchar, "originExecutionId" uuid, source text, "recordedAt" timestamptz, "totalTokens" bigint, "pricingStatus" text, "priceCurrency" text, "priceAmount" numeric)`
        )
        await runner.query(
            'INSERT INTO observation_assistant_fixture (id,"tenantId","organizationId",name,"workspaceId") VALUES ($1,$2,$3,$4,$5)',
            [assistant, tenant, organization, 'Assistant A', workspace]
        )
        await runner.query(
            'INSERT INTO observation_workspace_fixture (id,"tenantId","organizationId",name) VALUES ($1,$2,$3,$4)',
            [workspace, tenant, organization, 'Workspace A']
        )
        await runner.query(
            'INSERT INTO observation_conversation_fixture (id,"tenantId","organizationId","from") VALUES ($1,$2,$3,$4)',
            [conversation, tenant, organization, 'web']
        )
        await runner.query(
            'INSERT INTO observation_thread_fixture (id,"tenantId","organizationId","threadId","conversationId") VALUES ($1,$2,$3,$4,$5)',
            [uuid(7), tenant, organization, 'branch-a', conversation]
        )
        const add = async (
            id: number,
            start: number,
            end: number | null,
            status: string,
            org = organization,
            parent: string | null = null,
            metadata = {}
        ) =>
            runner.query(
                'INSERT INTO observation_execution_fixture (id,"tenantId","organizationId","xpertId","parentId","threadId",title,status,metadata,"createdById","createdAt","completedAt","elapsedTime",error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
                [
                    uuid(id),
                    tenant,
                    org,
                    assistant,
                    parent,
                    'branch-a',
                    id === 10 ? '100% task' : `Task ${id}`,
                    status,
                    metadata,
                    user,
                    at(start),
                    end === null ? null : at(end),
                    end === null ? null : (end - start) * 60000,
                    status === 'error' ? 'secret fixture error body' : null
                ]
            )
        await runner.query('UPDATE observation_assistant_fixture SET title = $1 WHERE id = $2', [
            'Display Assistant A',
            assistant
        ])
        await add(10, -5, 8, 'success')
        await add(11, 3, 12, 'error')
        await add(12, 20, null, 'running')
        await add(13, 30, null, 'pending')
        await add(14, 31, null, 'success')
        await add(15, 32, null, 'legacy-status')
        await add(16, 0, 45, 'success', uuid(99))
        await add(17, 4, 7, 'success', organization, uuid(11), { invocationKind: 'external_assistant' })
        await add(18, -10, 0, 'success')
        await add(19, 45, 50, 'success')
        await add(20, 10, 10, 'success')
        // Only Xpert inherits WorkspaceBaseEntity's delete-date column. Executions, threads,
        // conversations, workspaces and ledger records have no soft-delete column.
        await runner.query(
            'INSERT INTO observation_assistant_fixture (id,"tenantId","organizationId",name,"workspaceId","deletedAt") VALUES ($1,$2,$3,$4,$5,now())',
            [uuid(22), tenant, organization, 'Removed assistant', workspace]
        )
        await add(21, 1, 2, 'success')
        await runner.query('UPDATE observation_execution_fixture SET "xpertId" = $1 WHERE id = $2', [
            uuid(22),
            uuid(21)
        ])
        for (const [id, executionId, currency, amount, pricing, org, tokens] of [
            [30, 10, 'USD', '1.25', 'priced', organization, 100],
            [31, 11, 'EUR', '2', 'priced', organization, 200],
            [32, 12, 'USD', null, 'priced', organization, 50],
            [33, 17, 'USD', '99', 'priced', organization, 999],
            [34, 10, 'USD', '88', 'priced', uuid(99), 888]
        ] as const)
            await runner.query(
                'INSERT INTO observation_ledger_fixture (id,"tenantId","organizationId","originExecutionId",source,"recordedAt","totalTokens","pricingStatus","priceCurrency","priceAmount") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [
                    uuid(id),
                    tenant,
                    org,
                    uuid(executionId),
                    MembershipLedgerSourceEnum.ModelUsage,
                    at(40),
                    tokens,
                    pricing,
                    currency,
                    amount
                ]
            )
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(user)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenant)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organization)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        const access = new ObservationAccessService(
            { findOne: async () => null },
            { existsBy: async () => false },
            { existsBy: async () => false },
            { findOne: async () => null },
            { execute: jest.fn() }
        )
        jest.spyOn(access, 'assert').mockResolvedValue(undefined) // Authorization has separate role/revocation tests.
        usage = new ObservationUsageService(runner.manager.getRepository(MembershipPointLedger))
        service = new ExecutionObservationService(runner.manager.getRepository(XpertAgentExecution), access, usage)
        api = service.createScopedApi({ tenantId: tenant, organizationId: organization, userId: user })
    }, 30000)
    afterAll(async () => {
        jest.restoreAllMocks()
        await runner?.release()
        await db?.destroy()
    })

    it('filters scope and half-open edges while retaining executions of a soft-deleted Assistant', async () => {
        const first = await api.query(input),
            second = await api.query({ ...input, page: 2 })
        expect((await api.query({ ...input, search: 'Display Assistant' })).total).toBe(7)
        expect(first.total).toBe(8)
        expect(first.items).toHaveLength(2)
        expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(4)
        expect((await api.query({ ...input, search: '100%' })).items.map((row) => row.id)).toEqual([uuid(10)])
        expect((await api.query({ ...input, statuses: ['unknown'] })).items.map((row) => row.id)).toEqual([uuid(15)])
    })
    it('keeps summaries independent of pages and retains missing phase/end evidence', async () => {
        const summary = await api.summary({ ...input, page: 9, pageSize: 1 })
        expect(summary.total).toBe(8)
        expect(summary.peakOverlap).toBe(2)
        expect(summary.unknownEnds).toBe(3)
        expect(summary.conversations).toBe(1)
        expect(summary.durationSamples).toBe(4)
        expect(summary.usage).toMatchObject({
            records: 3,
            totalTokens: 350,
            coveredExecutions: 3,
            unpricedRecords: 1,
            currencies: [
                { currency: 'EUR', amount: 2 },
                { currency: 'USD', amount: 1.25 }
            ]
        })
        expect((await api.overview(input)).assistants.find((row) => row.id === assistant)?.total).toBe(7)
    })
    it('loads only compact overview data and defers ledger/detail reads until requested', async () => {
        await runner.query('UPDATE observation_assistant_fixture SET avatar = $1 WHERE id = $2', [
            JSON.stringify({ emoji: { id: 'memo' } }),
            assistant
        ])
        const ledger = jest.spyOn(usage, 'summarize')
        const overview = await api.overview(input)
        expect(ledger).not.toHaveBeenCalled()
        expect(overview.summary).not.toHaveProperty('usage')
        expect(overview).not.toHaveProperty('executions')
        expect(overview.assistants.find((row) => row.id === assistant)).toMatchObject({
            avatar: { emoji: { id: 'memo', unified: '1f4dd' } },
            failures: [{ id: uuid(11), completedAt: at(12) }]
        })
        const first = await api.query({ ...overview.query, assistantId: assistant, pageSize: 2 })
        const second = await api.query({ ...overview.query, assistantId: assistant, pageSize: 2, page: 2 })
        expect(first.total).toBe(7)
        expect(first.items.every((row) => row.assistantId === assistant)).toBe(true)
        expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(4)
        await api.summary(overview.query)
        expect(ledger).toHaveBeenCalledTimes(1)
        ledger.mockRestore()
    })
    it('groups whole conversations before pagination and distinguishes thread branches from child calls', async () => {
        const rootQuery = {
            ...input,
            assistantId: assistant,
            countingUnit: 'assistant_invocation' as const,
            pageSize: 1
        }
        const conversations = await api.conversations(rootQuery)
        expect(conversations.total).toBe(1)
        expect(conversations.items[0]).toMatchObject({
            conversationId: conversation,
            total: 8,
            threads: 1,
            branches: 0,
            childExecutions: 1
        })
        expect((await api.conversations({ ...rootQuery, page: 2 })).items).toHaveLength(0)
        expect(
            (await api.query({ ...rootQuery, conversationId: conversation, threadId: 'branch-a', pageSize: 100 })).total
        ).toBe(8)
        expect((await api.query({ ...rootQuery, conversationId: uuid(99) })).total).toBe(0)
        expect((await api.query({ ...rootQuery, threadId: 'foreign-thread' })).total).toBe(0)
        await expect(api.conversations(input)).rejects.toThrow()
        await runner.query(
            'INSERT INTO observation_thread_fixture (id,"tenantId","organizationId","threadId","conversationId","parentThreadId","forkedFromMessageId") VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [uuid(70), tenant, organization, 'branch-b', conversation, 'branch-a', uuid(71)]
        )
        await runner.query('UPDATE observation_execution_fixture SET "threadId" = $1 WHERE id = $2', [
            'branch-b',
            uuid(17)
        ])
        try {
            const branchSummary = await api.conversations(rootQuery)
            expect(branchSummary.items[0]).toMatchObject({ total: 8, threads: 2, branches: 1, childExecutions: 1 })
            expect(
                (await api.query({ ...rootQuery, conversationId: conversation, threadId: 'branch-b' })).items[0]
            ).toMatchObject({ parentThreadId: 'branch-a', forkedFromMessageId: uuid(71) })
        } finally {
            await runner.query('UPDATE observation_execution_fixture SET "threadId" = $1 WHERE id = $2', [
                'branch-a',
                uuid(17)
            ])
            await runner.query('DELETE FROM observation_thread_fixture WHERE id = $1', [uuid(70)])
        }
    })
    it('counts delegated Assistant calls only when explicitly requested', async () => {
        const result = await api.query({ ...input, countingUnit: 'assistant_invocation', pageSize: 100 })
        expect(result.total).toBe(9)
        expect(result.items.find((row) => row.id === uuid(17))?.invocationKind).toBe('external_assistant')
    })
    it('authorizes detail and child lookups in the same scope without leaking error bodies', async () => {
        const detail = await api.get({ executionId: uuid(11) })
        expect(detail.item.hasError).toBe(true)
        expect(detail.item.endKnown).toBe(true)
        expect((await api.get({ executionId: uuid(12) })).item.endKnown).toBe(false)
        expect(detail.item).not.toHaveProperty('error')
        expect(detail.children.map((row) => row.id)).toEqual([uuid(17)])
        await expect(api.get({ executionId: uuid(16) })).rejects.toThrow()
    })
    it('bounds anomaly rules and applies exact source/workspace filters', async () => {
        const result = await api.findAnomalies({ query: input, rule: 'failed', limit: 1 })
        expect(result.total).toBe(1)
        expect(result.items[0].id).toBe(uuid(11))
        expect((await api.query({ ...input, source: 'web', workspaceId: workspace })).total).toBe(7)
        expect((await api.query({ ...input, source: 'api' })).total).toBe(0)
        expect((await api.get({ executionId: uuid(21) })).item.assistantName).toBeNull()
        expect((await api.query({ ...input, search: 'Removed assistant' })).total).toBe(0)
        expect((await api.workspaces({ page: 1, search: 'Workspace' })).items).toEqual([
            { id: workspace, name: 'Workspace A' }
        ])
    })
})
