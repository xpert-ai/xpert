import { AiModelTypeEnum, MembershipLedgerSourceEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ModelUsageLedgerService } from './model-usage-ledger.service'

describe('ModelUsageLedgerService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('stores LLM token usage and its amount as a unified model-usage fact', async () => {
        let stored: MembershipPointLedger | undefined
        const insert = {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockImplementation((entry) => {
                stored = entry
                return insert
            }),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 'ledger-1' }] })
        }
        const repository = {
            create: jest.fn((entry) => Object.assign(new MembershipPointLedger(), entry, { id: 'usage-ledger-1' })),
            createQueryBuilder: jest.fn(() => insert),
            find: jest.fn().mockImplementation(async () => (stored ? [stored] : []))
        }
        const membership = { recordUsage: jest.fn().mockResolvedValue(null) }
        const service = new ModelUsageLedgerService(
            repository as never,
            membership as never,
            { find: jest.fn() } as never
        )

        await expect(
            service.recordTokenUsage(
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-1',
                    originId: 'thread-1',
                    xpertId: 'xpert-1',
                    copilotId: 'copilot-1',
                    providerScopeId: 'provider-scope-1',
                    provider: 'tongyi'
                },
                {
                    requestId: 'request-1',
                    model: 'qwen3.7-plus',
                    modelType: AiModelTypeEnum.LLM,
                    promptTokens: 80,
                    completionTokens: 20,
                    totalTokens: 100,
                    priceAmount: 0.5,
                    priceCurrency: 'CNY'
                }
            )
        ).resolves.toEqual({ requestId: 'request-1', recorded: true, ledgerIds: [expect.any(String)] })

        expect(stored).toEqual(
            expect.objectContaining({
                source: MembershipLedgerSourceEnum.ModelUsage,
                pointsDelta: 0,
                originType: 'model',
                modality: 'text',
                operation: AiModelTypeEnum.LLM,
                unit: 'token',
                promptTokens: 80,
                completionTokens: 20,
                totalTokens: 100,
                pricingStatus: 'priced',
                priceAmount: 0.5,
                priceCurrency: 'CNY',
                settlementAmount: 0.5,
                settlementCurrency: 'CNY'
            })
        )
        expect(membership.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                settlementAmount: 0.5,
                settlementCurrency: 'CNY',
                sourceReference: 'model-usage-charge:usage-ledger-1'
            })
        )
    })

    it('stores model usage in the membership ledger and settles its CNY amount through membership billing', async () => {
        const stored: MembershipPointLedger[] = []
        let pending: MembershipPointLedger | undefined
        const insert = {
            insert: jest.fn().mockReturnThis(),
            into: jest.fn().mockReturnThis(),
            values: jest.fn().mockImplementation((entry) => {
                pending = entry
                return insert
            }),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockImplementation(async () => {
                if (pending) stored.push(pending)
                return { identifiers: pending ? [{ id: pending.id }] : [] }
            })
        }
        const manager = {
            create: jest.fn((_entity, entry) =>
                Object.assign(new MembershipPointLedger(), entry, { id: 'usage-ledger-2' })
            ),
            createQueryBuilder: jest.fn(() => insert),
            find: jest.fn().mockImplementation(async () => stored)
        }
        const repository = {
            manager: {
                transaction: jest.fn((callback) => callback(manager))
            }
        }
        const membership = {
            recordUsage: jest.fn().mockResolvedValue(null)
        }
        const service = new ModelUsageLedgerService(
            repository as never,
            membership as never,
            { find: jest.fn() } as never
        )

        await expect(
            service.recordUsage(
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    copilotOrganizationId: 'org-1',
                    userId: 'user-1',
                    originExecutionId: 'execution-1',
                    xpertId: 'xpert-1',
                    copilotId: 'copilot-1',
                    providerScopeId: 'provider-scope-1',
                    provider: 'volcengine'
                },
                {
                    requestId: 'request-1',
                    model: 'seedream',
                    modelType: AiModelTypeEnum.IMAGE,
                    operation: 'text_to_image',
                    modality: 'image',
                    metrics: [{ unit: 'generation', quantity: 1, authority: 'provider' }]
                },
                {
                    capturedAt: '2026-08-15T00:00:00.000Z',
                    rules: [
                        {
                            id: 'seedream-generation',
                            version: '2026-08-15',
                            effective_from: '2026-08-15T00:00:00.000Z',
                            unit: 'generation',
                            unit_size: 1,
                            unit_price: 0.6,
                            currency: 'CNY',
                            charge_type: 'paid'
                        }
                    ]
                }
            )
        ).resolves.toMatchObject({ requestId: 'request-1', recorded: true })

        expect(stored).toEqual([
            expect.objectContaining({
                source: MembershipLedgerSourceEnum.ModelUsage,
                pointsDelta: 0,
                requestId: 'request-1',
                unit: 'generation',
                quantity: 1,
                pricingStatus: 'priced',
                priceAmount: 0.6,
                priceCurrency: 'CNY',
                settlementAmount: 0.6,
                settlementCurrency: 'CNY',
                exchangeRate: 1
            })
        ])
        expect(membership.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'user-1',
                settlementAmount: 0.6,
                settlementCurrency: 'CNY',
                sourceReference: 'model-usage-charge:usage-ledger-2'
            })
        )
    })

    it('returns historical token usage without duplicating current settlement rows', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const historical = Object.assign(new MembershipPointLedger(), {
            id: 'legacy-ledger-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            source: MembershipLedgerSourceEnum.Usage,
            pointsDelta: -10,
            tokenUsed: 1000,
            provider: 'tongyi',
            model: 'qwen3.7-plus',
            copilotId: 'copilot-1',
            createdAt: new Date('2026-08-01T01:00:00.000Z'),
            updatedAt: new Date('2026-08-01T01:00:00.000Z'),
            settlementAmount: null
        })
        const currentSettlement = Object.assign(new MembershipPointLedger(), {
            ...historical,
            id: 'settlement-ledger-1',
            settlementAmount: 0.1,
            settlementCurrency: 'CNY'
        })
        const queryBuilder = createReadQueryBuilder([historical, currentSettlement])
        const repository = {
            createQueryBuilder: jest.fn(() => queryBuilder)
        }
        const userRepository = {
            find: jest.fn().mockResolvedValue([
                {
                    id: 'user-1',
                    firstName: 'Yu',
                    lastName: 'Rongku'
                }
            ])
        }
        const service = new ModelUsageLedgerService(
            repository as never,
            { recordUsage: jest.fn() } as never,
            userRepository as never
        )

        await expect(service.findPage({ unit: 'token', modality: 'text' }, { take: 20, skip: 0 })).resolves.toEqual({
            items: [
                expect.objectContaining({
                    id: 'legacy-ledger-1',
                    requestId: 'legacy:legacy-ledger-1',
                    userName: 'Yu Rongku',
                    provider: 'tongyi',
                    model: 'qwen3.7-plus',
                    modality: 'text',
                    operation: AiModelTypeEnum.LLM,
                    unit: 'token',
                    totalTokens: 1000,
                    recordedAt: new Date('2026-08-01T01:00:00.000Z'),
                    charge: expect.objectContaining({
                        pricingStatus: 'unpriced',
                        amount: null,
                        settlementAmount: null
                    })
                })
            ],
            total: 1
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('legacyUsageSources'),
            expect.objectContaining({
                modelUsageSource: MembershipLedgerSourceEnum.ModelUsage,
                legacyUsageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
            })
        )
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ledger.unit = :unit'), {
            unit: 'token',
            legacyUsageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('ledger.modality = :modality'), {
            modality: 'text',
            legacyUsageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
        })
        expect(userRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    tenantId: 'tenant-1',
                    id: expect.anything()
                }
            })
        )
    })

    it('groups totals by model-client modality and treats RMB as the CNY currency alias', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const queryBuilder = createTotalsQueryBuilder([
            {
                modality: 'video',
                unit: 'second',
                currency: 'RMB',
                pricingStatus: 'priced',
                settlementCurrency: 'CNY',
                quantity: '8',
                promptTokens: '0',
                completionTokens: '0',
                totalTokens: '0',
                amount: '1.2',
                settlementAmount: '1.2',
                records: '1'
            }
        ])
        const repository = { createQueryBuilder: jest.fn(() => queryBuilder) }
        const service = new ModelUsageLedgerService(
            repository as never,
            { recordUsage: jest.fn() } as never,
            { find: jest.fn() } as never
        )

        await expect(service.totals({ currency: 'rmb' })).resolves.toEqual([
            expect.objectContaining({
                modality: 'video',
                unit: 'second',
                quantity: 8,
                amount: 1.2,
                settlementAmount: 1.2
            })
        ])
        expect(queryBuilder.groupBy).toHaveBeenCalledWith("COALESCE(ledger.modality, 'text')")
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('UPPER(ledger.priceCurrency) IN (:...currencies)', {
            currencies: ['CNY', 'RMB']
        })
    })
})

function createReadQueryBuilder(entries: MembershipPointLedger[]) {
    const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest
            .fn()
            .mockResolvedValue([entries, entries.filter((entry) => !entry.settlementAmount).length])
    }
    return queryBuilder
}

function createTotalsQueryBuilder(rows: Array<Record<string, string>>) {
    return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows)
    }
}
