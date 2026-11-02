import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, ModelUsagePricingSnapshot, ModelUsageReport } from '@xpert-ai/contracts'
import { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider/queries/get-model.query'
import { CopilotGetOneQuery } from '../../../copilot/queries/get-one.query'
import { CopilotCheckLimitCommand } from '../../../copilot-user/commands/check-limit.command'
import { CopilotUsageService } from '../../../copilot-usage'
import { AgentMiddlewareModelRuntimeService } from './model-runtime.service'
import { FakeStreamingChatModel } from '../fake-streaming-chat-model'

describe('middleware model actual usage recording', () => {
    const snapshot: ModelUsagePricingSnapshot = {
        capturedAt: '2026-10-30T00:00:00Z',
        rules: [
            {
                id: 'input',
                version: '1',
                effective_from: '2026-10-01',
                unit: 'token',
                token_type: 'prompt',
                unit_size: 1000,
                unit_price: 0.01,
                currency: 'CNY',
                charge_type: 'paid'
            }
        ]
    }
    const report: ModelUsageReport = {
        requestId: 'provider-request',
        model: 'provider-alias',
        modelType: AiModelTypeEnum.TEXT_EMBEDDING,
        operation: AiModelTypeEnum.TEXT_EMBEDDING,
        modality: 'text',
        metrics: [{ unit: 'token', promptTokens: 32, totalTokens: 32, authority: 'provider' }],
        recordedAt: '2026-10-30T01:00:00Z'
    }

    function fixture() {
        const commands = new CommandBus(null)
        const dispatch = jest.spyOn(commands, 'execute').mockResolvedValue(undefined)
        const queries = new QueryBus(null)
        const recordModelUsage = jest
            .fn<
                ReturnType<CopilotUsageService['recordModelUsage']>,
                Parameters<CopilotUsageService['recordModelUsage']>
            >()
            .mockResolvedValue({ requestId: report.requestId, recorded: true, ledgerIds: ['ledger'] })
        const pricing = jest.fn().mockReturnValue(snapshot)
        const clients: TChatModelOptions[] = []
        const provider = {
            getProviderModels: () => [],
            getModelManager: () => ({ getUsagePricingSnapshot: pricing, getParameterRules: () => [] }),
            getModelInstance: jest.fn(async (_type: AiModelTypeEnum, _model: unknown, options: TChatModelOptions) => {
                clients.push(options)
                return _type === AiModelTypeEnum.LLM ? new FakeStreamingChatModel({ sleep: 0 }) : {}
            })
        }
        jest.spyOn(queries, 'execute').mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotGetOneQuery)
                return {
                    id: 'copilot',
                    organizationId: 'provider-org',
                    modelProvider: { id: 'provider-scope', providerName: 'provider', credentials: {} }
                }
            if (query instanceof GetCopilotProviderModelQuery) return [{ modelProperties: { context_size: 4096 } }]
            if (query instanceof AIModelGetProviderQuery) return provider
            throw new Error('Unexpected query')
        })
        const service = new AgentMiddlewareModelRuntimeService(
            commands,
            queries,
            {} as never,
            {} as never,
            { recordModelUsage } as never
        )
        const scope = {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            xpertId: 'assistant',
            executionId: 'execution'
        }
        const create = async (
            modelType = AiModelTypeEnum.TEXT_EMBEDDING,
            purpose: 'invoke' | 'observe' = 'invoke',
            userId = scope.userId
        ) => {
            await service.createModelClient(
                { copilotId: 'copilot', model: 'configured-model', modelType },
                { purpose },
                { ...scope, userId }
            )
            return clients[clients.length - 1]
        }
        return { create, scope, dispatch, pricing, recordModelUsage, provider }
    }

    it('records provider quantities with the captured price and trusted model/identity scope', async () => {
        const f = fixture()
        const options = await f.create()
        const frozen = await options.resolveUsagePricingSnapshot({
            model: 'configured-model',
            operation: report.operation,
            modality: report.modality,
            startedAt: snapshot.capturedAt
        })
        f.pricing.mockReturnValue({ ...snapshot, rules: [] })
        await options.handleModelUsage({ ...report, pricingSnapshot: frozen })
        expect(f.dispatch).toHaveBeenCalledWith(expect.any(CopilotCheckLimitCommand))
        expect(f.pricing).toHaveBeenCalledTimes(1)
        expect(f.recordModelUsage).toHaveBeenCalledWith(
            {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                xpertId: 'assistant',
                copilotOrganizationId: 'provider-org',
                modelAccess: undefined,
                copilotId: 'copilot',
                providerScopeId: 'provider-scope',
                provider: 'provider',
                originExecutionId: 'execution'
            },
            { ...report, model: 'configured-model', pricingSnapshot: frozen },
            snapshot
        )
    })

    it('resolves a fallback price only when the provider did not attach a snapshot', async () => {
        const f = fixture()
        const options = await f.create()
        await options.handleModelUsage(report)
        expect(f.pricing).toHaveBeenCalledWith(
            'configured-model',
            {},
            {
                model: 'configured-model',
                operation: report.operation,
                modality: report.modality,
                pricingDimensions: undefined,
                startedAt: report.recordedAt
            }
        )
        expect(f.recordModelUsage.mock.calls[0][2]).toBe(snapshot)
    })

    it('preserves image generation units rather than inventing token counts', async () => {
        const f = fixture()
        const options = await f.create(AiModelTypeEnum.IMAGE)
        const image: ModelUsageReport = {
            requestId: 'image-request',
            modelType: AiModelTypeEnum.IMAGE,
            operation: 'text_to_image',
            modality: 'image',
            metrics: [{ unit: 'generation', quantity: 2, authority: 'provider' }],
            pricingSnapshot: { ...snapshot, rules: [] }
        }
        await options.handleModelUsage(image)
        expect(f.recordModelUsage.mock.calls[0][1]).toEqual({ ...image, model: 'configured-model' })
        expect(f.pricing).not.toHaveBeenCalled()
    })

    it('does not attach a second usage recorder to LLM clients', async () => {
        expect((await fixture().create(AiModelTypeEnum.LLM)).handleModelUsage).toBeUndefined()
    })

    it('does not admit or record usage in observe mode', async () => {
        const f = fixture()
        const options = await f.create(AiModelTypeEnum.TEXT_EMBEDDING, 'observe')
        expect(options.handleModelUsage).toBeUndefined()
        expect(f.dispatch).not.toHaveBeenCalled()
        expect(f.recordModelUsage).not.toHaveBeenCalled()
    })

    it('keeps separate clients attributed to their own users', async () => {
        const f = fixture()
        const first = await f.create()
        const second = await f.create(AiModelTypeEnum.TEXT_EMBEDDING, 'invoke', 'other-user')
        await Promise.all([
            first.handleModelUsage(report),
            second.handleModelUsage({ ...report, requestId: 'other-request' })
        ])
        expect(f.recordModelUsage.mock.calls.map(([scope, usage]) => [scope.userId, usage.requestId])).toEqual([
            ['user', 'provider-request'],
            ['other-user', 'other-request']
        ])
    })

    it('propagates accounting failure and never creates a client after access denial', async () => {
        const f = fixture()
        const options = await f.create()
        f.recordModelUsage.mockRejectedValue(new Error('accounting failed'))
        await expect(options.handleModelUsage(report)).rejects.toThrow('accounting failed')
        f.dispatch.mockRejectedValue(new Error('quota exhausted'))
        await expect(f.create()).rejects.toThrow('quota exhausted')
        expect(f.provider.getModelInstance).toHaveBeenCalledTimes(1)
    })
})
