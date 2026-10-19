jest.mock('../../../copilot-model/utils/context-size', () => ({ ensureCopilotModelContextSize: jest.fn() }))
import { randomUUID } from 'node:crypto'
import { CommandBus } from '@nestjs/cqrs'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'
import type { TChatModelOptions, TLLMUsage } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareModelRuntimeService } from './model-runtime.service'
import { FakeStreamingChatModel } from '../fake-streaming-chat-model'
import { CopilotGetOneQuery } from '../../../copilot/queries/get-one.query'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider/queries/get-model.query'
import { AIModelGetProviderQuery } from '../../../ai-model/queries/get-provider.query'
import {
    AdmitPipelineModelCallCommand,
    SettlePipelineModelCallCommand
} from '../../../xpert-project/pipeline/budget/pipeline-model-budget.command'

describe('middleware-created native LLM budget wiring', () => {
    function fixture(allow: boolean) {
        const model = new FakeStreamingChatModel({ sleep: 0 })
        const providerCall = jest.spyOn(model, '_generate')
        const commands = new CommandBus(null)
        const execute = jest.spyOn(commands, 'execute').mockImplementation(async (command) => {
            if (command instanceof AdmitPipelineModelCallCommand) {
                if (!allow) throw Error('budget denied')
                return true
            }
            return undefined
        })
        const copilot = {
            role: AiProviderRole.Primary,
            id: randomUUID(),
            modelProvider: { id: randomUUID(), providerName: 'test' }
        }
        let options: TChatModelOptions
        const queries = {
            execute: jest.fn(async (query) => {
                if (query instanceof CopilotGetOneQuery) return copilot
                if (query instanceof GetCopilotProviderModelQuery) return []
                if (query instanceof AIModelGetProviderQuery)
                    return {
                        getModelManager: () => ({ getParameterRules: () => [] }),
                        getModelInstance: (_type: unknown, _model: unknown, input: TChatModelOptions) => {
                            options = input
                            return model
                        }
                    }
                throw Error('Unexpected query')
            })
        }
        const service = new AgentMiddlewareModelRuntimeService(
            commands,
            queries as never,
            {} as never,
            {} as never,
            {} as never
        )
        const scope = {
            tenantId: randomUUID(),
            organizationId: randomUUID(),
            userId: randomUUID(),
            executionId: randomUUID()
        }
        return { service, scope, model, providerCall, execute, copilot, options: () => options }
    }
    it('does not call a provider when the durable admission command rejects', async () => {
        const f = fixture(false)
        await f.service.createModelClient(
            { model: 'test', modelType: AiModelTypeEnum.LLM, copilotId: f.copilot.id },
            {},
            f.scope
        )
        await expect(f.model.invoke('Synthetic request')).rejects.toThrow('budget denied')
        expect(f.providerCall).not.toHaveBeenCalled()
    })
    it('settles the original reservation through the existing actual-usage callback', async () => {
        const f = fixture(true)
        await f.service.createModelClient(
            { model: 'test', modelType: AiModelTypeEnum.LLM, copilotId: f.copilot.id },
            {},
            f.scope
        )
        const usage: TLLMUsage = {
            totalTokens: 25,
            promptTokens: 20,
            completionTokens: 5,
            promptUnitPrice: 0,
            completionUnitPrice: 0,
            promptPriceUnit: 0,
            completionPriceUnit: 0,
            promptPrice: 0,
            completionPrice: 0,
            totalPrice: 0,
            currency: 'USD',
            latency: 1
        }
        const report = BaseCallbackHandler.fromMethods({
            handleLLMEnd: (_output, requestId) =>
                f.options().handleLLMTokens({ copilot: f.copilot, model: 'test', requestId, usage })
        })
        report.awaitHandlers = true
        report.raiseError = true
        await f.model.invoke('Synthetic request', { callbacks: [report] })
        expect(f.providerCall).toHaveBeenCalledTimes(1)
        const admitted = f.execute.mock.calls.find(([command]) => command instanceof AdmitPipelineModelCallCommand)?.[0]
        if (!(admitted instanceof AdmitPipelineModelCallCommand)) throw Error('Admission missing')
        expect(admitted.input.executionId).toBe(f.scope.executionId)
        expect(f.execute).toHaveBeenCalledWith(
            new SettlePipelineModelCallCommand({ ...admitted.input, actualTokens: 25 })
        )
    })
})
