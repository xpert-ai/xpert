import { randomUUID } from 'node:crypto'
import { CommandBus } from '@nestjs/cqrs'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { FakeStreamingChatModel } from './fake-streaming-chat-model'
import { createNativeModelBudgetGate } from './native-model-budget'
import {
    AdmitPipelineModelCallCommand,
    SettlePipelineModelCallCommand
} from '../../xpert-project/pipeline/budget/pipeline-model-budget.command'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'

describe('native model admission at the real LangChain callback boundary', () => {
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const usage: TLLMUsage = {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
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
    function setup() {
        const commands = new CommandBus(null),
            execute = jest.spyOn(commands, 'execute').mockResolvedValue(true)
        let executionId: string = randomUUID()
        const gate = createNativeModelBudgetGate(commands, actor, () => executionId)
        const model = new FakeStreamingChatModel({ sleep: 0, responses: [new AIMessage('ok')] })
        const provider = jest.spyOn(model, '_generate')
        const streamProvider = jest.spyOn(model, '_streamResponseChunks')
        gate.attach(model)
        return {
            commands,
            execute,
            gate,
            model,
            provider,
            streamProvider,
            setExecution: (id: string) => {
                executionId = id
            }
        }
    }
    it.each(['invoke', 'stream'] as const)('denies %s before any provider work', async (mode) => {
        const f = setup()
        f.execute.mockRejectedValue(new Error('budget denied'))
        if (mode === 'invoke') await expect(f.model.invoke('hello')).rejects.toThrow('budget denied')
        else
            await expect(
                (async () => {
                    for await (const _chunk of await f.model.stream('hello')) {
                        /* exhaust */
                    }
                })()
            ).rejects.toThrow('budget denied')
        expect(f.provider).not.toHaveBeenCalled()
        expect(f.streamProvider).not.toHaveBeenCalled()
    })
    it('settles the admitted execution even if the shared model is resumed under a different execution', async () => {
        const f = setup(),
            first = randomUUID()
        f.setExecution(first)
        await f.model.invoke('hello')
        const command = f.execute.mock.calls[0][0]
        expect(command).toBeInstanceOf(AdmitPipelineModelCallCommand)
        if (!(command instanceof AdmitPipelineModelCallCommand)) throw Error('admission missing')
        f.setExecution(randomUUID())
        await f.gate.record(command.input.requestId, usage)
        expect(f.execute.mock.calls[1][0]).toEqual(
            new SettlePipelineModelCallCommand({ ...command.input, actualTokens: 15 })
        )
        await f.gate.record(command.input.requestId, usage)
        expect(f.execute).toHaveBeenCalledTimes(2)
    })
    it('does not settle estimates, unavailable usage, zero values or unrelated callbacks', async () => {
        const f = setup()
        await f.model.invoke('hello')
        const command = f.execute.mock.calls[0][0]
        if (!(command instanceof AdmitPipelineModelCallCommand)) throw Error('admission missing')
        await f.gate.record(command.input.requestId, { ...usage, type: 'estimated' })
        await f.gate.record(command.input.requestId, { ...usage, totalTokens: 0 })
        await f.gate.record(command.input.requestId, undefined)
        await f.gate.record(randomUUID(), usage)
        expect(f.execute).toHaveBeenCalledTimes(1)
        await f.gate.record(command.input.requestId, usage)
        expect(f.execute).toHaveBeenCalledTimes(2)
    })
    it('preserves existing callbacks and gives each batched invocation its own reservation', async () => {
        const f = setup(),
            ended = jest.fn()
        const callback = BaseCallbackHandler.fromMethods({ handleLLMEnd: ended })
        callback.awaitHandlers = true
        f.model.callbacks = [...(Array.isArray(f.model.callbacks) ? f.model.callbacks : []), callback]
        await f.model.batch([[new HumanMessage('one')], [new HumanMessage('two')]])
        const ids = f.execute.mock.calls.flatMap(([command]) =>
            command instanceof AdmitPipelineModelCallCommand ? [command.input.requestId] : []
        )
        expect(new Set(ids).size).toBe(2)
        expect(ended).toHaveBeenCalledTimes(2)
        expect(f.provider).toHaveBeenCalledTimes(2)
    })
    it('charges every explicit retry and blocks a fallback before its provider call', async () => {
        const f = setup()
        f.provider.mockRejectedValueOnce(new Error('response lost'))
        f.execute.mockResolvedValueOnce(true).mockRejectedValue(new Error('budget denied'))
        await expect(f.model.withRetry({ stopAfterAttempt: 2 }).invoke('hello')).rejects.toThrow('budget denied')
        expect(f.provider).toHaveBeenCalledTimes(1)
        expect(f.execute).toHaveBeenCalledTimes(2)
    })
})
