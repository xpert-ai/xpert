import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { StatisticsTokenCostQueryHandler } from '../chat-conversation/queries/handlers/statistics-token-cost.handler'
import { StatisticsTokenCostQuery } from '../chat-conversation/queries/statistics-token-cost.query'
import { XpertAgentExecution } from './agent-execution.entity'
import { XpertAgentExecutionService } from './agent-execution.service'

import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { CopilotUserUsageQuery } from '../copilot-user/queries/copilot-user-usage.query'
import { CopilotUserUsageHandler } from '../copilot-user/queries/handlers/copilot-user-usage.handler'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'

const postgres = process.env.XPERT_EXECUTION_USAGE_PG_E2E === '1' ? describe : describe.skip

postgres('execution costs and token statistics', () => {
    const schema = 'execution_cost_' + randomUUID().replace(/-/g, '')
    let db: DataSource

    beforeAll(async () => {
        const numberTransformer = {
            to: (value: number | null) => value,
            from: (value: string | null) => (value == null ? null : Number(value))
        }
        const scope = {
            id: { type: String, primary: true },
            tenantId: { type: String },
            organizationId: { type: String },
            threadId: { type: String },
            usageHour: { type: String }
        }
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            database: process.env.DB_NAME,
            username: process.env.DB_USER,
            password: process.env.DB_PASS,
            schema,
            extra: { options: '-c search_path=' + schema + ',public' },
            entities: [
                new EntitySchema<CopilotUser>({
                    name: 'CopilotUser',
                    target: CopilotUser,
                    tableName: 'copilot_user',
                    columns: { ...scope, tokenUsed: { type: Number } }
                }),
                new EntitySchema<MembershipPointLedger>({
                    name: 'MembershipPointLedger',
                    target: MembershipPointLedger,
                    tableName: 'membership_point_ledger',
                    columns: {
                        ...scope,
                        runtimeOrganizationId: { type: String },
                        source: { type: String },
                        pointsDelta: { type: 'numeric' }
                    }
                }),
                new EntitySchema<XpertAgentExecution>({
                    name: 'XpertAgentExecution',
                    target: XpertAgentExecution,
                    tableName: 'xpert_agent_execution',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        parentId: { type: 'uuid', nullable: true },
                        metadata: { type: 'json', nullable: true },
                        usageSummary: { type: 'jsonb', nullable: true },
                        currency: { type: String, nullable: true },
                        totalPrice: { type: 'numeric', nullable: true, transformer: numberTransformer },
                        tokens: { type: 'bigint', transformer: numberTransformer },
                        inputTokens: { type: 'bigint', transformer: numberTransformer },
                        outputTokens: { type: 'bigint', transformer: numberTransformer },
                        responseLatency: { type: Number },
                        inputUnitPrice: { type: Number },
                        inputPriceUnit: { type: Number },
                        outputUnitPrice: { type: Number },
                        outputPriceUnit: { type: Number }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.query(`CREATE TABLE xpert_agent_execution (
            id uuid PRIMARY KEY, "tenantId" text DEFAULT 'tenant', "parentId" uuid,metadata json, currency text,"totalPrice" numeric(20,7),
            tokens bigint DEFAULT 0, "inputTokens" bigint DEFAULT 0,"outputTokens" bigint DEFAULT 0,
            "responseLatency" float,"inputUnitPrice" numeric,"inputPriceUnit" numeric,"outputUnitPrice" numeric,"outputPriceUnit" numeric)`)
        await db.query(
            'CREATE TABLE chat_conversation (id uuid PRIMARY KEY,"tenantId" text,"organizationId" text,"from" text,"createdAt" timestamptz)'
        )
        await db.query('CREATE TABLE chat_message ("conversationId" uuid, "executionId" uuid, role text)')
        await db.query(`CREATE TABLE membership_point_ledger (
            id text PRIMARY KEY, "tenantId" text, "userId" text, source text, "originExecutionId" uuid,
            "sourceReference" text, "gatewayRequestId" text, "pointsDelta" numeric)`)
        await db.query(`ALTER TABLE membership_point_ledger ADD COLUMN "organizationId" text,
            ADD COLUMN "runtimeOrganizationId" text, ADD COLUMN "threadId" text, ADD COLUMN "usageHour" text`)
        await db.query(`CREATE TABLE copilot_user (id text, "tenantId" text, "organizationId" text,
            "threadId" text, "usageHour" text, "tokenUsed" bigint)`)
        const name = '20261110000100-execution-usage-summary.sql'
        const sql = readFileSync(join(__dirname, 'migrations', name), 'utf8')
        await db.query(sql)
        await db.query(sql)
        expect(await db.query(readFileSync(join(__dirname, 'migrations', 'checks', name), 'utf8'))).toEqual([])
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            try {
                await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            } finally {
                await db.destroy()
            }
        }
    })

    it('keeps distinct internal currencies and reports posted points once across repeated chat messages', async () => {
        const root = randomUUID(),
            child = randomUUID(),
            conversation = randomUUID()
        await db.query(
            'INSERT INTO xpert_agent_execution (id,currency,"totalPrice",tokens,"inputTokens","outputTokens") VALUES ($1,\'USD\',1,10,8,2)',
            [root]
        )
        await db.query(
            'INSERT INTO xpert_agent_execution (id,"parentId",currency,"totalPrice",tokens) VALUES ($1,$2,\'EUR\',3,6)',
            [child, root]
        )
        await db.query(
            `INSERT INTO xpert_agent_execution (id,"tenantId","parentId",tokens) VALUES ($1,'other',$2,80)`,
            [randomUUID(), root]
        )
        await db.query(`INSERT INTO chat_conversation VALUES ($1,'tenant','org','chat','2026-01-05')`, [conversation])
        await db.query(`INSERT INTO chat_message VALUES ($1,$2,'ai'),($1,$2,'ai')`, [conversation, root])
        const service = new XpertAgentExecutionService(db.getRepository(XpertAgentExecution))
        const details = {
            promptTokens: 8,
            completionTokens: 2,
            totalTokens: 10,
            totalPrice: 1,
            currency: 'USD',
            latency: 10,
            promptUnitPrice: 1,
            promptPriceUnit: 1,
            promptPrice: 1,
            completionUnitPrice: 0,
            completionPriceUnit: 1,
            completionPrice: 0
        }
        await Promise.all([
            service.recordUsage(root, { tokens: 10, details }),
            service.recordUsage(root, { tokens: 10, details: { ...details, currency: 'CNY' } }),
            service.recordUsage(root, { tokens: 10, type: 'estimated' })
        ])
        const row = await db.getRepository(XpertAgentExecution).findOneByOrFail({ id: root })
        expect(Number(row.tokens)).toBe(40)
        expect(Number(row.inputTokens)).toBe(24)
        expect(row.currency).toBeNull()
        expect(row.totalPrice).toBeNull()
        expect(row.usageSummary.costs).toEqual(
            expect.arrayContaining([
                { currency: 'USD', amount: 2, tokens: 20 },
                { currency: 'CNY', amount: 1, tokens: 10 }
            ])
        )
        await db.query(
            `INSERT INTO membership_point_ledger VALUES
            ('fact', 'tenant', 'payer', 'model_usage', $1, NULL, 'gateway', 0),
            ('plan', 'tenant', 'payer', 'usage', NULL, 'model-usage-charge:fact', 'gateway', -2),
            ('personal', 'tenant', 'payer', 'personal_usage', NULL, 'model-usage-charge:fact:personal', NULL, -0.125),
            ('wrongTenant', 'other', 'payer', 'usage', NULL, 'model-usage-charge:fact', NULL, -50),
            ('wrongPayer', 'tenant', 'other', 'usage', NULL, NULL, 'gateway', -100),
            ('credit', 'tenant', 'payer', 'recharge', NULL, NULL, 'gateway', 100),
            ('zeroFact', 'tenant', 'payer', 'model_usage', $2, NULL, 'zero', 0),
            ('zeroReceipt', 'tenant', 'payer', 'usage', NULL, NULL, 'zero', 0)`,
            [root, child]
        )
        const missing = randomUUID()
        const points = await service.getChargedPoints('tenant', [root, root, child, missing])
        expect(points).toEqual(
            new Map([
                [root, 2.125],
                [child, 0]
            ])
        )
        expect(await service.getChargedPoints('other', [root])).toEqual(new Map())
        const handler = new StatisticsTokenCostQueryHandler()
        handler.repository = db.getRepository(ChatConversation)
        const tenant = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        try {
            const rows = await handler.execute(new StatisticsTokenCostQuery('2026-01-01', '2026-02-01'))
            expect(rows).toEqual([
                { date: expect.anything(), model: expect.anything(), tokens: 46, chargedPoints: 2.125 }
            ])
        } finally {
            tenant.mockRestore()
            org.mockRestore()
        }
    })

    it('returns thread token totals and only posted points within the runtime organization and time range', async () => {
        await db.query(`INSERT INTO copilot_user VALUES ('counter', 'tenant', 'org', 'thread', '2026-01-02', 18)`)
        await db.query(`INSERT INTO membership_point_ledger
            (id,"tenantId","organizationId","runtimeOrganizationId","threadId","usageHour",source,"pointsDelta") VALUES
            ('thread-plan','tenant','billing-org','org','thread','2026-01-02','usage',-0.25),
            ('thread-personal','tenant',NULL,'org','thread','2026-01-02','personal_usage',-0.125),
            ('other-org','tenant','org','elsewhere','thread','2026-01-02','usage',-20),
            ('old','tenant','org',NULL,'thread','2025-01-02','usage',-10)`)
        const tenant = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const handler = new CopilotUserUsageHandler(db.getRepository(CopilotUser))
        try {
            const query = new CopilotUserUsageQuery({ threadId: 'thread', start: '2026-01-01', end: '2026-02-01' })
            expect(await handler.execute(query)).toEqual([{ tokenUsed: 18, chargedPoints: 0.375 }])
            await db.query("DELETE FROM membership_point_ledger WHERE id IN ('thread-plan','thread-personal')")
            expect(await handler.execute(query)).toEqual([{ tokenUsed: 18, chargedPoints: null }])
        } finally {
            tenant.mockRestore()
            org.mockRestore()
        }
    })
})
