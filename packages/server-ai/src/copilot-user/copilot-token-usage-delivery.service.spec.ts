import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { CopilotTokenUsageDeliveryService } from './copilot-token-usage-delivery.service'
import { CopilotTokenRecordCommand } from './commands/token-record.command'

describe('CopilotTokenUsageDeliveryService', () => {
    function createHarness() {
        const receipts: Array<{
            tenantId: string
            providerScopeId: string
            requestId: string
            payloadFingerprint: string
            status: 'pending' | 'completed'
            userRollupDeliveredAt?: Date | null
            organizationRollupDeliveredAt?: Date | null
            userTokenLimitExceeded?: boolean
            organizationTokenLimitExceeded?: boolean
            completedAt?: Date | null
        }> = []
        const receiptRepository = {
            createQueryBuilder: jest.fn(() => ({
                insert: jest.fn().mockReturnThis(),
                values: jest.fn((value) => {
                    if (
                        !receipts.some(
                            (item) =>
                                item.tenantId === value.tenantId &&
                                item.providerScopeId === value.providerScopeId &&
                                item.requestId === value.requestId
                        )
                    ) {
                        receipts.push({ ...value })
                    }
                    return {
                        orIgnore: jest.fn().mockReturnValue({ execute: jest.fn().mockResolvedValue({}) })
                    }
                })
            })),
            findOne: jest.fn(({ where }) =>
                Promise.resolve(
                    receipts.find(
                        (item) =>
                            item.tenantId === where.tenantId &&
                            item.providerScopeId === where.providerScopeId &&
                            item.requestId === where.requestId
                    ) ?? null
                )
            ),
            save: jest.fn(async (receipt) => receipt)
        }
        const manager = {
            getRepository: jest.fn(() => receiptRepository)
        }
        const dataSource = {
            transaction: jest.fn(async (callback) => callback(manager))
        }
        const copilotUserService = {
            upsert: jest.fn().mockResolvedValue({ tokenUsed: 100, tokenLimit: null })
        }
        const copilotOrganizationService = {
            upsert: jest.fn().mockResolvedValue({ tokenUsed: 100, tokenLimit: null })
        }
        const service = new CopilotTokenUsageDeliveryService(
            dataSource as never,
            copilotUserService as never,
            copilotOrganizationService as never
        )
        return { service, receipts, manager, copilotUserService, copilotOrganizationService }
    }

    const copilot = {
        id: 'copilot-1',
        organizationId: 'copilot-org-1',
        tokenBalance: null,
        modelProvider: { id: 'provider-scope-1', providerName: 'tongyi' }
    }

    const commandInput = new CopilotTokenRecordCommand({
        tenantId: 'tenant-1',
        requestId: 'request-1',
        organizationId: 'org-1',
        userId: 'runtime-user',
        copilotId: 'copilot-1',
        model: 'qwen',
        modelType: AiModelTypeEnum.LLM,
        tokenUsed: 100,
        priceUsed: 0.2,
        currency: 'CNY'
    }).input

    it('commits the user and organization rollups with one durable receipt', async () => {
        const { service, receipts, manager, copilotUserService, copilotOrganizationService } = createHarness()

        await expect(service.deliver(commandInput, copilot, 'billable-user')).resolves.toEqual({
            userTokenLimitExceeded: false,
            organizationTokenLimitExceeded: false
        })

        expect(copilotUserService.upsert).toHaveBeenCalledWith(expect.any(Object), manager)
        expect(copilotOrganizationService.upsert).toHaveBeenCalledWith(expect.any(Object), manager)
        expect(receipts).toHaveLength(1)
        expect(receipts[0]).toMatchObject({ status: 'completed' })
    })

    it('does not replay rollups after the receipt transaction committed', async () => {
        const { service, receipts, copilotUserService, copilotOrganizationService } = createHarness()

        await service.deliver(commandInput, copilot, 'billable-user')
        await service.deliver(commandInput, copilot, 'billable-user')

        expect(receipts).toHaveLength(1)
        expect(copilotUserService.upsert).toHaveBeenCalledTimes(1)
        expect(copilotOrganizationService.upsert).toHaveBeenCalledTimes(1)
    })

    it('rejects a replay whose billing payload changed', async () => {
        const { service } = createHarness()
        await service.deliver(commandInput, copilot, 'billable-user')

        await expect(
            service.deliver({ ...commandInput, tokenUsed: 101 }, copilot, 'billable-user')
        ).rejects.toMatchObject({ status: 400 })
    })
})
