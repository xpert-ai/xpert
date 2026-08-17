import {
    AiModelTypeEnum,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum
} from '@xpert-ai/contracts'
import { CopilotModelUsageRecordCommand } from '../model-usage-record.command'
import { CopilotModelUsageRecordHandler } from './model-usage-record.handler'

describe('CopilotModelUsageRecordHandler', () => {
    it('records specialized-model usage against the authorized billing identity and provider scope', async () => {
        const modelAccess: IModelAccessResolution = {
            allowed: true,
            channel: ModelAccessChannelEnum.Xpert,
            billableUserId: 'creator-user',
            copilotId: 'copilot-1',
            copilotModelId: 'rerank-v3',
            provider: 'cohere',
            modelType: AiModelTypeEnum.RERANK,
            model: 'rerank-v3',
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Organization,
            organizationId: 'org-1'
        }
        const copilotUsageService = {
            recordModelUsage: jest.fn().mockResolvedValue({
                requestId: 'rerank-request-1',
                recorded: true,
                ledgerIds: ['ledger-1']
            })
        }
        const modelAccessService = { assertCanUseModel: jest.fn() }
        const handler = new CopilotModelUsageRecordHandler(
            { execute: jest.fn() } as never,
            modelAccessService as never,
            copilotUsageService as never
        )

        await handler.execute(
            new CopilotModelUsageRecordCommand({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'runtime-user',
                xpertId: 'xpert-1',
                originId: 'thread-1',
                copilot: {
                    id: 'copilot-1',
                    organizationId: 'copilot-org-1',
                    modelProvider: {
                        id: 'provider-scope-1',
                        providerName: 'cohere'
                    }
                } as never,
                modelAccess,
                report: {
                    requestId: 'rerank-request-1',
                    model: 'rerank-v3',
                    modelType: AiModelTypeEnum.RERANK,
                    operation: AiModelTypeEnum.RERANK,
                    modality: 'text',
                    metrics: [{ unit: 'request', quantity: 1, authority: 'contract' }]
                },
                pricingSnapshot: {
                    capturedAt: '2026-08-17T00:00:00.000Z',
                    rules: []
                }
            })
        )

        expect(copilotUsageService.recordModelUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                copilotOrganizationId: 'copilot-org-1',
                userId: 'creator-user',
                originType: 'model',
                originId: 'thread-1',
                xpertId: 'xpert-1',
                copilotId: 'copilot-1',
                providerScopeId: 'provider-scope-1',
                provider: 'cohere',
                modelAccess
            }),
            expect.objectContaining({
                requestId: 'rerank-request-1',
                model: 'rerank-v3',
                modelType: AiModelTypeEnum.RERANK
            }),
            expect.objectContaining({ capturedAt: '2026-08-17T00:00:00.000Z' })
        )
        expect(modelAccessService.assertCanUseModel).not.toHaveBeenCalled()
    })
})
