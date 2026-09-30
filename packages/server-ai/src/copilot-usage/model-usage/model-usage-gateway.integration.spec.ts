import {
    AiModelTypeEnum,
    MembershipLedgerSourceEnum,
    MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
    ModelGatewayCallStatusEnum,
    ModelGatewayUsageChannelEnum,
    ModelGatewayUsageSourceEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TenantSetting } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, type EntitySchemaColumnOptions } from 'typeorm'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from '../../model-gateway/model-gateway-call.entity'
import { ModelGatewayService } from '../../model-gateway/model-gateway.service'
import { ModelUsageLedgerService } from './model-usage-ledger.service'

const connectionString = process.env.MODEL_USAGE_TEST_DATABASE_URL
const postgres = connectionString ? describe : describe.skip
const numeric: EntitySchemaColumnOptions = {
    type: 'numeric',
    nullable: true,
    transformer: {
        to: (value: number | null) => value,
        from: (value: string | null) => (value === null ? null : Number(value))
    }
}
const text: EntitySchemaColumnOptions = { type: 'varchar', nullable: true }
const timestamp: EntitySchemaColumnOptions = { type: 'timestamptz', nullable: true }
const scopeColumns = {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid', nullable: true },
    userId: { type: 'uuid', nullable: true },
    createdAt: timestamp,
    updatedAt: timestamp
} satisfies Record<string, EntitySchemaColumnOptions>

postgres('external API usage in the Usage Center (PostgreSQL)', () => {
    const schema = `model_usage_${randomUUID().replace(/-/g, '')}`
    const ledgerSchema = new EntitySchema<MembershipPointLedger>({
        name: MembershipPointLedger.name,
        target: MembershipPointLedger,
        tableName: 'membership_point_ledger',
        columns: {
            ...scopeColumns,
            source: text,
            pointsDelta: numeric,
            tokenUsed: numeric,
            provider: text,
            model: text,
            copilotId: text,
            usageChannel: text,
            gatewayRequestId: text,
            requestId: text,
            revision: { type: 'int', nullable: true },
            originType: text,
            originId: text,
            providerScopeId: text,
            modelType: text,
            modality: text,
            operation: text,
            metricKey: text,
            unit: text,
            authority: text,
            quantity: numeric,
            promptTokens: numeric,
            completionTokens: numeric,
            totalTokens: numeric,
            recordedAt: timestamp,
            chargedAt: timestamp,
            pricingStatus: text,
            priceQuantity: numeric,
            priceAmount: numeric,
            priceCurrency: text,
            settlementAmount: numeric,
            settlementCurrency: text,
            exchangeRate: numeric
        }
    })
    const gatewaySchema = new EntitySchema<ModelGatewayCall>({
        name: ModelGatewayCall.name,
        target: ModelGatewayCall,
        tableName: 'model_gateway_call',
        columns: {
            ...scopeColumns,
            requestId: { type: 'uuid' },
            publicationId: { type: 'uuid' },
            provider: text,
            model: text,
            status: text,
            usageSource: text,
            startedAt: timestamp,
            completedAt: timestamp,
            inputTokens: numeric,
            outputTokens: numeric,
            totalTokens: numeric,
            priceAmount: numeric,
            priceCurrency: text,
            settlementAmount: numeric,
            settlementCurrency: text,
            exchangeRate: numeric
        }
    })
    const database = new DataSource({
        type: 'postgres',
        url: connectionString,
        schema,
        extra: { options: `-c search_path=${schema},public` },
        entities: [
            ledgerSchema,
            gatewaySchema,
            new EntitySchema<TenantSetting>({
                name: TenantSetting.name,
                target: TenantSetting,
                tableName: 'tenant_setting',
                columns: {
                    id: { type: 'uuid', primary: true, generated: 'uuid' },
                    tenantId: { type: 'uuid' },
                    name: text,
                    value: text
                }
            })
        ]
    })
    const tenantId = randomUUID()
    const organizationId = randomUUID()
    const userId = randomUUID()
    const recordedAt = new Date('2026-09-30T04:00:00Z')
    const membership = { recordUsage: jest.fn() }
    let service: ModelUsageLedgerService
    let gatewayService: ModelGatewayService

    beforeAll(async () => {
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        service = new ModelUsageLedgerService(
            database.getRepository(MembershipPointLedger),
            membership as never,
            {
                find: jest.fn().mockResolvedValue([{ id: userId, firstName: 'API', lastName: 'User' }])
            } as never
        )
        gatewayService = new ModelGatewayService(
            undefined as never,
            undefined as never,
            undefined as never,
            database.getRepository(ModelGatewayCall),
            undefined as never,
            undefined as never,
            undefined as never,
            membership as never,
            undefined as never,
            database
        )
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
    })
    beforeEach(async () => {
        await database.getRepository(MembershipPointLedger).clear()
        await database.getRepository(ModelGatewayCall).clear()
        await database.getRepository(TenantSetting).clear()
        membership.recordUsage.mockClear()
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
    })
    afterAll(async () => {
        jest.restoreAllMocks()
        if (database.isInitialized) {
            try {
                await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await database.destroy()
            }
        }
    })

    async function gateway(overrides: Partial<ModelGatewayCall> = {}) {
        return database.getRepository(ModelGatewayCall).save({
            tenantId,
            organizationId,
            userId,
            requestId: randomUUID(),
            publicationId: randomUUID(),
            provider: 'test-provider',
            model: 'test-model',
            status: ModelGatewayCallStatusEnum.Succeeded,
            usageSource: ModelGatewayUsageSourceEnum.Provider,
            createdAt: recordedAt,
            updatedAt: recordedAt,
            startedAt: recordedAt,
            completedAt: recordedAt,
            inputTokens: 800,
            outputTokens: 200,
            totalTokens: 1000,
            priceAmount: 0.2,
            priceCurrency: 'CNY',
            settlementAmount: 0.2,
            settlementCurrency: 'CNY',
            ...overrides
        })
    }
    async function enableRetention() {
        await database.getRepository(TenantSetting).save([
            { tenantId, name: MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING, value: 'true' },
            { tenantId, name: MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING, value: '1' }
        ])
    }
    async function debit(requestId: string, overrides: Partial<MembershipPointLedger> = {}) {
        return database.getRepository(MembershipPointLedger).save({
            tenantId,
            organizationId,
            userId,
            source: MembershipLedgerSourceEnum.Usage,
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
            gatewayRequestId: requestId,
            provider: 'test-provider',
            model: 'test-model',
            copilotId: 'copilot-1',
            tokenUsed: 1000,
            pointsDelta: -0.1,
            priceAmount: 0.2,
            priceCurrency: 'CNY',
            settlementAmount: 0.1,
            settlementCurrency: 'CNY',
            createdAt: recordedAt,
            updatedAt: recordedAt,
            ...overrides
        })
    }

    async function usage(requestId: string, overrides: Partial<MembershipPointLedger> = {}) {
        return debit(requestId, {
            source: MembershipLedgerSourceEnum.ModelUsage,
            usageChannel: ModelGatewayUsageChannelEnum.Xpert,
            gatewayRequestId: null,
            requestId,
            revision: 1,
            originType: 'model',
            originId: requestId,
            providerScopeId: 'provider-1',
            modelType: AiModelTypeEnum.LLM,
            modality: 'text',
            operation: AiModelTypeEnum.LLM,
            metricKey: 'token',
            unit: 'token',
            authority: 'provider',
            totalTokens: 1000,
            promptTokens: 800,
            completionTokens: 200,
            recordedAt,
            chargedAt: recordedAt,
            pricingStatus: 'priced',
            priceQuantity: 1000,
            pointsDelta: 0,
            ...overrides
        })
    }

    it('includes charged external calls in accounts, details, breakdowns and totals without writing or double counting debits', async () => {
        const call = await gateway()
        await debit(call.requestId)
        await debit(call.requestId, { source: MembershipLedgerSourceEnum.PersonalUsage, tokenUsed: 0 })
        const query = { organizationId }
        expect(await service.findAccountPage(query)).toMatchObject({
            total: 1,
            items: [
                {
                    userId,
                    usages: [{ modality: 'text', unit: 'token', quantity: 1000 }],
                    pricedAmounts: { llm: 0.2, video: 0, total: 0.2 }
                }
            ]
        })
        expect(await service.findPage(query)).toMatchObject({
            total: 1,
            items: [
                {
                    requestId: call.requestId,
                    userId,
                    userName: 'API User',
                    promptTokens: 800,
                    completionTokens: 200,
                    totalTokens: 1000,
                    charge: { pricingStatus: 'priced', amount: 0.2, settlementAmount: 0.2 }
                }
            ]
        })
        expect(await service.findBreakdownPage(query, 'model')).toMatchObject({
            items: [{ calls: 1, settlementAmount: 0.2, usages: [{ quantity: 1000 }] }]
        })
        expect(await service.findBreakdownPage(query, 'provider')).toMatchObject({
            items: [{ calls: 1, models: ['test-model'] }]
        })
        expect(await service.totals(query)).toMatchObject([
            { records: 1, totalTokens: 1000, amount: 0.2, settlementAmount: 0.2 }
        ])
        expect(await database.getRepository(MembershipPointLedger).count()).toBe(2)
        expect(membership.recordUsage).not.toHaveBeenCalled()
    })

    it('includes free and unpriced usage even when no points ledger was created', async () => {
        await gateway({ priceAmount: 0, settlementAmount: 0 })
        await gateway({ priceAmount: null, priceCurrency: null, settlementAmount: null, settlementCurrency: null })
        expect(await service.findPage({ organizationId })).toMatchObject({ total: 2 })
        expect(await service.findPage({ organizationId, pricingStatus: 'free' })).toMatchObject({
            total: 1,
            items: [{ charge: { amount: 0 } }]
        })
        expect(await service.findPage({ organizationId, pricingStatus: 'unpriced' })).toMatchObject({
            total: 1,
            items: [{ charge: { amount: null } }]
        })
    })

    it('applies the same tenant, organization, user, model, unit, modality, currency and date filters to external calls', async () => {
        await gateway()
        await gateway({ tenantId: randomUUID() })
        await gateway({ organizationId: randomUUID() })
        const query = {
            organizationId,
            userId,
            provider: 'test-provider',
            model: 'test-model',
            unit: 'token' as const,
            modality: 'text' as const,
            currency: 'RMB',
            start: '2026-09-30T03:00:00Z',
            end: '2026-09-30T05:00:00Z'
        }
        expect(await service.findPage(query)).toMatchObject({ total: 1 })
        for (const filter of [
            { userId: randomUUID() },
            { provider: 'other' },
            { model: 'other' },
            { unit: 'second' as const },
            { modality: 'video' as const },
            { currency: 'USD' },
            { start: '2026-10-01T00:00:00Z' }
        ]) {
            expect(await service.findPage({ ...query, ...filter })).toEqual({ items: [], total: 0 })
        }
    })

    it('keeps completed failed usage and excludes in-flight or empty failed calls', async () => {
        await gateway({ status: ModelGatewayCallStatusEnum.Failed, usageSource: ModelGatewayUsageSourceEnum.Estimated })
        await gateway({ status: ModelGatewayCallStatusEnum.Started, completedAt: null })
        await gateway({
            status: ModelGatewayCallStatusEnum.Failed,
            usageSource: ModelGatewayUsageSourceEnum.None,
            totalTokens: 0,
            priceAmount: null
        })
        expect(await service.findPage({ organizationId })).toMatchObject({ total: 1 })
    })

    it('does not reconstruct unknown call facts from orphaned debit rows', async () => {
        const requestId = randomUUID()
        await debit(requestId)
        await debit(requestId, { source: MembershipLedgerSourceEnum.PersonalUsage, tokenUsed: 0, priceAmount: null })
        expect(await service.findPage({ organizationId })).toMatchObject({ total: 0 })
    })

    it.each([2, 0.5])(
        'retains model cost when actual debits differ (%s CNY) after retention',
        async (chargedAmount) => {
            await enableRetention()
            const call = await gateway({
                completedAt: new Date('2000-09-01T12:00:00Z'),
                priceAmount: 1,
                settlementAmount: 1
            })
            await debit(call.requestId, {
                priceAmount: 1,
                settlementAmount: chargedAmount * 0.75,
                pointsDelta: -chargedAmount * 0.75
            })
            await debit(call.requestId, {
                source: MembershipLedgerSourceEnum.PersonalUsage,
                tokenUsed: 0,
                priceAmount: null,
                settlementAmount: chargedAmount * 0.25,
                pointsDelta: -chargedAmount * 0.25
            })
            const debitsBefore = await database.getRepository(MembershipPointLedger).find({ order: { id: 'ASC' } })
            const query = { organizationId }
            const before = await service.findPage(query)
            const beforeAccounts = await service.findAccountPage(query)
            const beforeBreakdown = await service.findBreakdownPage(query, 'model')
            const beforeTotals = await service.totals(query)
            expect(before.items[0].charge.settlementAmount).toBe(1)
            expect(await gatewayService.purgeExpiredCalls()).toMatchObject({ deleted: 1 })
            expect(await service.findPage(query)).toEqual(before)
            expect(await service.findAccountPage(query)).toEqual(beforeAccounts)
            expect(await service.findBreakdownPage(query, 'model')).toEqual(beforeBreakdown)
            expect(await service.totals(query)).toEqual(beforeTotals)
            const entriesAfter = await database.getRepository(MembershipPointLedger).find({ order: { id: 'ASC' } })
            expect(entriesAfter.filter((entry) => entry.source !== MembershipLedgerSourceEnum.ModelUsage)).toEqual(
                debitsBefore
            )
            expect(
                entriesAfter.filter((entry) => entry.source === MembershipLedgerSourceEnum.ModelUsage)
            ).toMatchObject([{ pointsDelta: 0 }])
            expect(membership.recordUsage).not.toHaveBeenCalled()
        }
    )

    it('retains the API Key organization when billing used a tenant membership', async () => {
        await enableRetention()
        const call = await gateway({ completedAt: new Date('2000-09-01T12:00:00Z') })
        await debit(call.requestId, { organizationId: null })
        const before = await service.findPage({ organizationId })
        expect(before.total).toBe(1)
        await gatewayService.purgeExpiredCalls()
        expect(await service.findPage({ organizationId })).toEqual(before)
        expect(await service.findPage({ organizationId: randomUUID() })).toMatchObject({ total: 0 })
    })

    it('retains the completion day after a next-day settlement retry', async () => {
        await enableRetention()
        const call = await gateway({ completedAt: new Date('2000-09-01T23:59:00Z') })
        await debit(call.requestId, { createdAt: new Date('2000-09-02T00:04:00Z') })
        const query = { organizationId, start: '2000-09-01T00:00:00Z', end: '2000-09-01T23:59:59Z' }
        const before = await service.findPage(query)
        expect(before.total).toBe(1)
        await gatewayService.purgeExpiredCalls()
        expect(await service.findPage(query)).toEqual(before)
        expect(
            await service.findPage({ organizationId, start: '2000-09-02T00:00:00Z', end: '2000-09-02T23:59:59Z' })
        ).toMatchObject({ total: 0 })
    })

    it('retains free and unpriced calls without debit rows and does not duplicate repeated retention', async () => {
        await enableRetention()
        const completedAt = new Date('2000-09-01T12:00:00Z')
        await gateway({ completedAt, priceAmount: 0, settlementAmount: 0 })
        await gateway({
            completedAt,
            priceAmount: null,
            priceCurrency: null,
            settlementAmount: null,
            settlementCurrency: null
        })
        const before = await service.findPage({ organizationId })
        expect(await gatewayService.purgeExpiredCalls()).toMatchObject({ deleted: 2 })
        expect(await service.findPage({ organizationId })).toEqual(before)
        expect(await gatewayService.purgeExpiredCalls()).toMatchObject({ deleted: 0 })
        expect(await database.getRepository(MembershipPointLedger).count()).toBe(2)
        expect(membership.recordUsage).not.toHaveBeenCalled()
    })

    it('leaves call records intact when their usage snapshot cannot be stored', async () => {
        await enableRetention()
        const call = await gateway({ completedAt: new Date('2000-09-01T12:00:00Z'), model: 'blocked-archive' })
        await database.query(
            `ALTER TABLE "${schema}".membership_point_ledger ADD CONSTRAINT archive_failure CHECK (model <> 'blocked-archive')`
        )
        try {
            await expect(gatewayService.purgeExpiredCalls()).rejects.toThrow()
            expect(await database.getRepository(ModelGatewayCall).findOneBy({ id: call.id })).not.toBeNull()
            expect(await database.getRepository(MembershipPointLedger).count()).toBe(0)
        } finally {
            await database.query(`ALTER TABLE "${schema}".membership_point_ledger DROP CONSTRAINT archive_failure`)
        }
    })

    it('archives only expired terminal calls for tenants with retention enabled', async () => {
        await enableRetention()
        const completedAt = new Date('2000-09-01T12:00:00Z')
        const expired = await gateway({ completedAt })
        const disabled = await gateway({ completedAt, tenantId: randomUUID() })
        const pending = await gateway({ completedAt, status: ModelGatewayCallStatusEnum.SettlementPending })
        const started = await gateway({ completedAt: null, status: ModelGatewayCallStatusEnum.Started })
        const recent = await gateway({ completedAt: new Date() })
        await gateway({ completedAt, status: ModelGatewayCallStatusEnum.Failed, totalTokens: 0, priceAmount: null })
        expect(await gatewayService.purgeExpiredCalls()).toMatchObject({ deleted: 2 })
        const remaining = await database.getRepository(ModelGatewayCall).find()
        expect(remaining.map((call) => call.id).sort()).toEqual([disabled.id, pending.id, started.id, recent.id].sort())
        expect(await database.getRepository(MembershipPointLedger).find()).toMatchObject([
            { id: expired.id, source: MembershipLedgerSourceEnum.ModelUsage, pointsDelta: 0 }
        ])
    })

    it('keeps internal and legacy usage alongside gateway calls without including internal settlement rows', async () => {
        await gateway()
        await usage(randomUUID(), { priceAmount: 0.4, settlementAmount: 0.4 })
        await debit(randomUUID(), {
            usageChannel: ModelGatewayUsageChannelEnum.Xpert,
            gatewayRequestId: null,
            priceAmount: 0.4,
            settlementAmount: 0.4
        })
        await debit(randomUUID(), {
            usageChannel: ModelGatewayUsageChannelEnum.Xpert,
            gatewayRequestId: null,
            settlementAmount: null
        })
        expect(await service.findPage({ organizationId })).toMatchObject({
            total: 3,
            items: expect.arrayContaining([
                expect.objectContaining({ requestId: expect.stringMatching(/^legacy:/), totalTokens: 1000 })
            ])
        })
        expect(await service.findAccountPage({ organizationId })).toMatchObject({
            items: [{ usages: [{ quantity: 3000 }], pricedAmounts: { total: 0.6 } }]
        })
        expect(await service.findBreakdownPage({ organizationId }, 'model')).toMatchObject({
            items: [{ calls: 3, settlementAmount: 0.6 }]
        })
    })

    it('prefers a unified usage fact if the same gateway request already has one', async () => {
        await enableRetention()
        const call = await gateway({ completedAt: new Date('2000-09-01T12:00:00Z') })
        await debit(call.requestId)
        const fact = await usage(call.requestId, {
            usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
            gatewayRequestId: call.requestId,
            settlementAmount: 0.2
        })
        expect(await service.findPage({ organizationId })).toMatchObject({
            total: 1,
            items: [{ id: fact.id, requestId: call.requestId }]
        })
        expect(await gatewayService.purgeExpiredCalls()).toMatchObject({ deleted: 1 })
        expect(await database.getRepository(MembershipPointLedger).count()).toBe(2)
        expect(await service.findAccountPage({ organizationId })).toMatchObject({
            total: 1,
            items: [{ usages: [{ quantity: 1000 }], pricedAmounts: { total: 0.2 } }]
        })
    })

    it('paginates external requests and accounts and honors the current organization over a supplied filter', async () => {
        await gateway()
        await gateway({ userId: randomUUID(), completedAt: new Date('2026-09-30T05:00:00Z') })
        await gateway({ organizationId: randomUUID() })
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
        const query = { organizationId: randomUUID() }
        const first = await service.findPage(query, { take: 1 })
        const second = await service.findPage(query, { take: 1, skip: 1 })
        expect(first.total).toBe(2)
        expect(first.items).toHaveLength(1)
        expect(second.items).toHaveLength(1)
        expect(first.items[0].requestId).not.toBe(second.items[0].requestId)
        expect(await service.findAccountPage(query, { take: 1 })).toMatchObject({
            total: 2,
            items: [expect.anything()]
        })
    })
})
