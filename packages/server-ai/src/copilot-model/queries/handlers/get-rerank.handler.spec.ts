import {
    AiModelTypeEnum,
    IModelAccessResolution,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum
} from '@xpert-ai/contracts'
import { Document } from '@langchain/core/documents'
import { IRerank } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { AIModelGetProviderQuery } from '../../../ai-model'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotCheckLimitCommand, CopilotModelUsageRecordCommand } from '../../../copilot-user'
import { CopilotModelGetRerankQuery } from '../get-rerank.query'
import { CopilotModelGetRerankHandler } from './get-rerank.handler'

describe('CopilotModelGetRerankHandler', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('runtime-user')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('checks exact model access before returning the reranker', async () => {
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
        const commandBus = {
            execute: jest.fn(async (command) => (command instanceof CopilotCheckLimitCommand ? modelAccess : undefined))
        }
        const reranker = {
            rerank: jest.fn().mockResolvedValue([{ index: 0, relevanceScore: 0.9 }])
        }
        const getModelInstance = jest.fn().mockResolvedValue(reranker)
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof GetCopilotProviderModelQuery) {
                    return []
                }
                if (query instanceof AIModelGetProviderQuery) {
                    return { getModelInstance }
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new CopilotModelGetRerankHandler(
            commandBus as never,
            queryBus as never,
            { t: jest.fn() } as never
        )
        const query = new CopilotModelGetRerankQuery(
            {
                id: 'copilot-1',
                modelProvider: {
                    id: 'provider-1',
                    providerName: 'cohere'
                }
            } as never,
            {
                copilotId: 'copilot-1',
                model: 'rerank-v3',
                modelType: AiModelTypeEnum.RERANK
            } as never,
            {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            }
        )

        const wrappedReranker = (await handler.execute(query)) as IRerank

        const checkCommand = commandBus.execute.mock.calls[0][0] as CopilotCheckLimitCommand
        expect(checkCommand.input).toMatchObject({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'runtime-user',
            xpertId: 'xpert-1',
            copilot: expect.objectContaining({ id: 'copilot-1' }),
            model: 'rerank-v3',
            modelType: AiModelTypeEnum.RERANK
        })

        await expect(
            wrappedReranker.rerank(
                [new Document({ pageContent: 'A document to rerank.' })],
                'Which document is relevant?',
                { topN: 1, model: 'rerank-v3' }
            )
        ).resolves.toEqual([{ index: 0, relevanceScore: 0.9 }])

        expect(
            commandBus.execute.mock.calls.filter(([command]) => command instanceof CopilotCheckLimitCommand)
        ).toHaveLength(1)
    })

    it('propagates provider failures after the access check', async () => {
        const commandBus = {
            execute: jest.fn(async (command) =>
                command instanceof CopilotCheckLimitCommand
                    ? {
                          allowed: true,
                          billableUserId: 'creator-user',
                          accessSource: ModelAccessSourceEnum.Grant,
                          grantId: 'grant-1',
                          multiplier: 1
                      }
                    : undefined
            )
        }
        const reranker = {
            rerank: jest.fn().mockRejectedValue(new Error('provider failed'))
        }
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof GetCopilotProviderModelQuery) {
                    return []
                }
                if (query instanceof AIModelGetProviderQuery) {
                    return { getModelInstance: jest.fn().mockResolvedValue(reranker) }
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new CopilotModelGetRerankHandler(
            commandBus as never,
            queryBus as never,
            { t: jest.fn() } as never
        )
        const wrappedReranker = (await handler.execute(
            new CopilotModelGetRerankQuery(
                {
                    id: 'copilot-1',
                    modelProvider: {
                        id: 'provider-1',
                        providerName: 'cohere'
                    }
                } as never,
                {
                    copilotId: 'copilot-1',
                    model: 'rerank-v3',
                    modelType: AiModelTypeEnum.RERANK
                } as never,
                {}
            )
        )) as IRerank

        await expect(
            wrappedReranker.rerank([new Document({ pageContent: 'document' })], 'query', {
                model: 'rerank-v3'
            })
        ).rejects.toThrow('provider failed')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
    })

    it('provides rerank adapters with the unified usage reporter', async () => {
        const modelAccess = {
            allowed: true,
            billableUserId: 'creator-user',
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-1',
            multiplier: 1
        }
        const commandBus = {
            execute: jest.fn(async (command) => (command instanceof CopilotCheckLimitCommand ? modelAccess : undefined))
        }
        const getModelInstance = jest.fn().mockResolvedValue({ rerank: jest.fn() })
        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query instanceof GetCopilotProviderModelQuery) return []
                if (query instanceof AIModelGetProviderQuery) {
                    return {
                        getModelInstance,
                        getModelManager: jest.fn().mockReturnValue({
                            getUsagePricingSnapshot: jest.fn().mockReturnValue({
                                capturedAt: '2026-08-17T00:00:00.000Z',
                                rules: []
                            })
                        })
                    }
                }
                throw new Error(`Unexpected query: ${query?.constructor?.name}`)
            })
        }
        const handler = new CopilotModelGetRerankHandler(
            commandBus as never,
            queryBus as never,
            { t: jest.fn() } as never
        )

        await handler.execute(
            new CopilotModelGetRerankQuery(
                {
                    id: 'copilot-1',
                    modelProvider: { id: 'provider-1', providerName: 'cohere', credentials: {} }
                } as never,
                {
                    copilotId: 'copilot-1',
                    model: 'rerank-v3',
                    modelType: AiModelTypeEnum.RERANK
                } as never,
                { xpertId: 'xpert-1' }
            )
        )

        const modelOptions = getModelInstance.mock.calls[0][2]
        await modelOptions.handleModelUsage({
            requestId: 'rerank-request-1',
            model: 'rerank-v3',
            modelType: AiModelTypeEnum.RERANK,
            operation: AiModelTypeEnum.RERANK,
            modality: 'text',
            metrics: [{ unit: 'request', quantity: 1, authority: 'contract' }],
            pricingSnapshot: { capturedAt: '2026-08-17T00:00:00.000Z', rules: [] }
        })

        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof CopilotModelUsageRecordCommand)
        ).toBe(true)
    })
})
