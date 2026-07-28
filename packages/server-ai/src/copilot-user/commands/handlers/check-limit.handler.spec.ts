import {
    AiModelTypeEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum
} from '@xpert-ai/contracts'
import { CopilotCheckLimitCommand } from '../check-limit.command'
import { CopilotCheckLimitHandler } from './check-limit.handler'

describe('CopilotCheckLimitHandler', () => {
    const modelAccessResolution = {
        allowed: true,
        billableUserId: 'creator-user',
        copilotId: 'copilot-1',
        copilotModelId: 'qwen3.6-plus',
        provider: 'tongyi',
        modelType: AiModelTypeEnum.LLM,
        model: 'qwen3.6-plus',
        accessSource: ModelAccessSourceEnum.Grant,
        grantId: 'grant-1',
        multiplier: 1,
        scope: ModelAccessOwnershipScopeEnum.Tenant
    }

    it('returns a controlled model error when the configured Copilot no longer exists', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn()
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn()
        }
        const modelAccessService = {
            assertCanUseModel: jest.fn()
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            modelAccessService as never,
            { t: jest.fn().mockResolvedValue('No AI model provided') } as never
        )

        await expect(
            handler.execute(
                new CopilotCheckLimitCommand({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    userId: 'user-1',
                    model: 'deepseek-chat',
                    modelType: AiModelTypeEnum.LLM
                })
            )
        ).rejects.toThrow('No AI model provided')
        expect(modelAccessService.assertCanUseModel).not.toHaveBeenCalled()
        expect(copilotUserService.getUsageSummary).not.toHaveBeenCalled()
    })

    it('uses the Xpert creator for authorization and user quota checks', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const modelAccessService = {
            assertCanUseModel: jest.fn().mockResolvedValue(modelAccessResolution)
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            modelAccessService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotCheckLimitCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1',
                copilot: {
                    id: 'copilot-1',
                    organizationId: 'copilot-org-1',
                    modelProvider: {
                        providerName: 'tongyi'
                    }
                } as never,
                model: 'qwen3.6-plus',
                modelType: AiModelTypeEnum.LLM
            })
        )

        expect(modelAccessService.assertCanUseModel).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'assistant-tech-user',
            xpertId: 'xpert-1',
            copilotId: 'copilot-1',
            copilotModelId: 'qwen3.6-plus',
            modelType: AiModelTypeEnum.LLM
        })
        expect(copilotUserService.getUsageSummary).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                orgId: 'copilot-org-1',
                userId: 'creator-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus'
            })
        )
    })

    it('checks membership access for an organization provider with configured credentials', async () => {
        const copilotUserService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const copilotOrganizationService = {
            getUsageSummary: jest.fn().mockResolvedValue({
                tokenUsed: 0,
                tokenLimit: null
            })
        }
        const modelAccessService = {
            assertCanUseModel: jest.fn().mockResolvedValue(modelAccessResolution)
        }
        const handler = new CopilotCheckLimitHandler(
            copilotUserService as never,
            copilotOrganizationService as never,
            modelAccessService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotCheckLimitCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'user-1',
                copilot: {
                    id: 'copilot-1',
                    organizationId: 'org-1',
                    modelProvider: {
                        organizationId: 'org-1',
                        providerName: 'deepseek',
                        credentials: { api_key: 'configured' }
                    }
                } as never,
                model: 'deepseek-chat',
                modelType: AiModelTypeEnum.LLM
            })
        )

        expect(modelAccessService.assertCanUseModel).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            xpertId: undefined,
            copilotId: 'copilot-1',
            copilotModelId: 'deepseek-chat',
            modelType: AiModelTypeEnum.LLM
        })
        expect(copilotUserService.getUsageSummary).toHaveBeenCalled()
        expect(copilotOrganizationService.getUsageSummary).toHaveBeenCalled()
    })
})
