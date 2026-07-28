import {
    AiModelTypeEnum,
    IModelAccessResolution,
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
        const membershipService = {
            recordUsage: jest.fn().mockResolvedValue(null)
        }
        const modelAccessService = {
            assertCanUseModel: jest.fn()
        }
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            modelAccessService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )
        const modelAccess = grantResolution()

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org-1',
                userId: 'assistant-tech-user',
                xpertId: 'xpert-1',
                threadId: 'thread-1',
                copilotId: 'copilot-1',
                model: 'qwen3.6-plus',
                modelType: AiModelTypeEnum.LLM,
                modelAccess,
                tokenUsed: 100
            })
        )

        expect(copilotUserService.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'runtime-org-1',
                orgId: 'copilot-org-1',
                userId: 'creator-user'
            })
        )
        expect(membershipService.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'runtime-org-1',
                copilotOrganizationId: 'copilot-org-1',
                userId: 'creator-user',
                provider: 'tongyi',
                model: 'qwen3.6-plus',
                tokenUsed: 100,
                usageHour: expect.any(String),
                modelAccess
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
        const membershipService = {
            recordUsage: jest.fn().mockResolvedValue(null)
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
        const handler = new CopilotTokenRecordHandler(
            queryBus as never,
            copilotUserService as never,
            copilotOrganizationService as never,
            membershipService as never,
            modelAccessService as never,
            { t: jest.fn().mockResolvedValue('limit exceeded') } as never
        )

        await handler.execute(
            new CopilotTokenRecordCommand({
                tenantId: 'tenant-1',
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
        expect(membershipService.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'org-1',
                userId: 'user-1',
                provider: 'deepseek',
                model: 'deepseek-chat',
                tokenUsed: 100,
                usageHour: expect.any(String),
                copilotId: 'copilot-1',
                modelAccess
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
    })
})
