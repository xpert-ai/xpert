import {
    AiModelTypeEnum,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum
} from '@xpert-ai/contracts'
import { CopilotGetOneQuery } from '../../../copilot/queries'
import { CopilotTokenRecordCommand } from '../token-record.command'
import { CopilotTokenRecordHandler } from './token-record.handler'

describe('CopilotTokenRecordHandler', () => {
    function grantResolution(overrides: Partial<IModelAccessResolution> = {}): IModelAccessResolution {
        return {
            allowed: true,
            channel: ModelAccessChannelEnum.Xpert,
            billableUserId: 'creator-user',
            copilotId: 'copilot-1',
            copilotModelId: 'qwen3.6-plus',
            provider: 'tongyi',
            modelType: AiModelTypeEnum.LLM,
            model: 'qwen3.6-plus',
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Tenant,
            ...overrides
        }
    }

    it('records membership usage with both runtime and copilot source scopes', async () => {
        const copilot = {
            id: 'copilot-1',
            organizationId: 'copilot-org-1',
            tokenBalance: null,
            modelProvider: {
                providerName: 'tongyi'
            }
        }
        const queryBus = {
            execute: jest.fn().mockImplementation(async (query) => {
                if (query instanceof CopilotGetOneQuery) {
                    return copilot
                }
                return null
            })
        }
        const copilotUserService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const modelAccessService = {
            assertCanUseModel: jest.fn()
        }
        const copilotUsageService = {
            recordTokenUsage: jest.fn().mockResolvedValue({
                requestId: 'llm-request-1',
                recorded: true,
                ledgerIds: ['usage-ledger-1']
            })
        }
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            modelAccessService as never,
            copilotUsageService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )
        const modelAccess = grantResolution()

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
                requestId: 'llm-request-1',
                organizationId: 'runtime-org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1',
                model: 'qwen3.6-plus',
                modelType: AiModelTypeEnum.LLM,
                modelAccess,
                tokenUsed: 100,
                priceUsed: 0.5,
                currency: 'CNY'
            })
        )

        expect(copilotUserService.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'runtime-org-1',
                orgId: 'copilot-org-1',
                userId: 'creator-user'
            })
        )
        expect(copilotUsageService.recordTokenUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org-1',
                userId: 'creator-user',
                originId: 'thread-1',
                copilotId: 'copilot-1',
                providerScopeId: 'copilot-1',
                provider: 'tongyi'
            }),
            expect.objectContaining({
                requestId: 'llm-request-1',
                model: 'qwen3.6-plus',
                modelType: AiModelTypeEnum.LLM,
                totalTokens: 100,
                priceAmount: 0.5,
                priceCurrency: 'CNY'
            })
        )
        expect(modelAccessService.assertCanUseModel).not.toHaveBeenCalled()
    })

    it('charges membership points for an organization provider with configured credentials', async () => {
        const copilot = {
            id: 'copilot-1',
            organizationId: 'org-1',
            tokenBalance: null,
            modelProvider: {
                organizationId: 'org-1',
                providerName: 'deepseek',
                credentials: { api_key: 'configured' }
            }
        }
        const queryBus = {
            execute: jest.fn().mockResolvedValue(copilot)
        }
        const copilotUserService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            upsert: jest.fn().mockResolvedValue({
                tokenUsed: 100,
                tokenLimit: null
            })
        }
        const modelAccess = grantResolution({
            billableUserId: 'user-1',
            copilotModelId: 'deepseek-chat',
            provider: 'deepseek',
            model: 'deepseek-chat',
            scope: ModelAccessOwnershipScopeEnum.Organization,
            organizationId: 'org-1'
        })
        const modelAccessService = {
            assertCanUseModel: jest.fn().mockResolvedValue(modelAccess)
        }
        const copilotUsageService = {
            recordTokenUsage: jest.fn().mockResolvedValue({
                requestId: 'llm-request-2',
                recorded: true,
                ledgerIds: ['usage-ledger-2']
            })
        }
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            modelAccessService as never,
            copilotUsageService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
                requestId: 'llm-request-2',
                organizationId: 'org-1',
                userId: 'user-1',
                copilotId: 'copilot-1',
                model: 'deepseek-chat',
                modelType: AiModelTypeEnum.LLM,
                tokenUsed: 100
            })
        )

        expect(copilotUserService.upsert).toHaveBeenCalled()
        expect(copilotOrganizationService.upsert).toHaveBeenCalled()
        expect(modelAccessService.assertCanUseModel).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            xpertId: undefined,
            copilotId: 'copilot-1',
            copilotModelId: 'deepseek-chat',
            modelType: AiModelTypeEnum.LLM
        })
    })
})
