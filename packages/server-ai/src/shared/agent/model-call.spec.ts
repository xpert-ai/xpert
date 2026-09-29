import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { XpertParameterTypeEnum } from '@xpert-ai/contracts'
import { z } from 'zod'
import i18next from 'i18next'
import { setModelVisionSupport } from '../../copilot-model/model-capabilities'
import { ModelCallOptions, prepareModelCall } from './model-call'

const first = tool(async () => 'first result', { name: 'first', description: 'First tool', schema: z.object({}) })
const second = tool(async () => 'second result', { name: 'second', description: 'Second tool', schema: z.object({}) })
const registeredTools = [first, second]
const messages = [new HumanMessage('request')]

function createModel(supportsVision = false) {
    const invoke = jest.fn(async (_messages: BaseMessage[], _config?: RunnableConfig) => new AIMessage('response'))
    const bindTools = jest.fn((_tools, _options) => RunnableLambda.from(invoke))
    const withStructuredOutput = jest.fn((_schema, _options) => RunnableLambda.from(async () => ({ title: 'outline' })))
    const model = setModelVisionSupport(
        Object.assign(RunnableLambda.from(invoke), { bindTools, withStructuredOutput }),
        supportsVision
    )
    return { model, invoke, bindTools, withStructuredOutput }
}

const outputAgent: ModelCallOptions['agent'] = {
    options: { structuredOutputMethod: 'jsonMode' },
    outputVariables: [
        { name: 'title', type: XpertParameterTypeEnum.STRING, variableSelector: 'title', operation: 'overwrite' }
    ]
}

describe('prepareModelCall', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    it('binds the final selection once and passes invocation config to the selected model', async () => {
        const fixture = createModel()
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [second], messages },
            { registeredTools, agent: {} }
        )
        expect(fixture.bindTools).toHaveBeenCalledTimes(1)
        expect(fixture.bindTools).toHaveBeenCalledWith([second], {})
        const signal = new AbortController().signal
        await prepared.model.invoke(prepared.messages, { signal, configurable: { thread_id: 'thread' } })
        expect(fixture.invoke.mock.calls[0][1]).toEqual(
            expect.objectContaining({ signal, configurable: { thread_id: 'thread' } })
        )
    })

    it.each([
        ['auto', 'auto'],
        ['none', 'none'],
        ['required', 'any'],
        [{ type: 'function', function: { name: 'second' } }, 'second']
    ] as const)('binds portable tool choice %s', async (toolChoice, expected) => {
        const fixture = createModel()
        await prepareModelCall(
            { model: fixture.model, tools: [second], messages, toolChoice },
            { registeredTools, agent: {} }
        )
        expect(fixture.bindTools).toHaveBeenCalledWith([second], { tool_choice: expected })
    })

    it.each(['unregistered', 'duplicate', 'named tool excluded', 'required without tools'] as const)(
        'rejects invalid selection (%s) before binding or resolving fallback',
        async (scenario) => {
            const fixture = createModel()
            const resolveFallbackModel = jest.fn(async () => createModel().model)
            const tools =
                scenario === 'unregistered'
                    ? [tool(async () => '', { name: 'first', description: 'Clone', schema: z.object({}) })]
                    : scenario === 'duplicate'
                      ? [first, first]
                      : scenario === 'named tool excluded'
                        ? [first]
                        : []
            await expect(
                prepareModelCall(
                    {
                        model: fixture.model,
                        tools,
                        messages,
                        toolChoice:
                            scenario === 'named tool excluded'
                                ? { type: 'function', function: { name: 'second' } }
                                : scenario === 'required without tools'
                                  ? 'required'
                                  : undefined
                    },
                    { registeredTools, agent: {}, resolveFallbackModel }
                )
            ).rejects.toThrow()
            expect(fixture.bindTools).not.toHaveBeenCalled()
            expect(resolveFallbackModel).not.toHaveBeenCalled()
        }
    )

    it('permits a plain Runnable when the final tool set is empty', async () => {
        const model = RunnableLambda.from(async () => new AIMessage('plain'))
        const prepared = await prepareModelCall({ model, tools: [], messages }, { registeredTools, agent: {} })
        expect(await prepared.model.invoke(prepared.messages)).toEqual(new AIMessage('plain'))
    })

    it('rejects an opaque model replacement that cannot bind the selected tools', async () => {
        const model = RunnableLambda.from(async () => new AIMessage('plain'))
        await expect(
            prepareModelCall({ model, tools: [first], messages }, { registeredTools, agent: {} })
        ).rejects.toThrow('bindTools')
    })

    it('rejects an opaque replacement that cannot apply the output schema', async () => {
        const model = RunnableLambda.from(async () => new AIMessage('plain'))
        await expect(
            prepareModelCall({ model, tools: [], messages }, { registeredTools, agent: outputAgent })
        ).rejects.toThrow('withStructuredOutput')
    })

    it('adds JSON instructions after the final tool selection without mutating the system message', async () => {
        const fixture = createModel()
        const systemMessage = new SystemMessage({ content: 'Instructions', id: 'system-id' })
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [], messages, systemMessage },
            { registeredTools, agent: outputAgent }
        )
        expect(fixture.bindTools).not.toHaveBeenCalled()
        expect(fixture.withStructuredOutput).toHaveBeenCalledTimes(1)
        expect(fixture.withStructuredOutput.mock.calls[0][1]).toEqual({ method: 'jsonMode' })
        expect(prepared.systemMessage.content).toContain('```json')
        expect(prepared.systemMessage.content).toContain('title')
        expect(prepared.systemMessage.id).toBe('system-id')
        expect(systemMessage.content).toBe('Instructions')
        expect(await prepared.model.invoke(prepared.messages)).toEqual({ title: 'outline' })
    })

    it('does not inject JSON instructions when tools remain selected', async () => {
        const fixture = createModel()
        const systemMessage = new SystemMessage('Instructions')
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [first], messages, systemMessage },
            { registeredTools, agent: outputAgent }
        )
        expect(prepared.systemMessage).toBe(systemMessage)
        expect(fixture.withStructuredOutput).not.toHaveBeenCalled()
    })

    it('rejects a no-tools choice that conflicts with function-calling output', async () => {
        const fixture = createModel()
        await expect(
            prepareModelCall(
                { model: fixture.model, tools: [], messages, toolChoice: 'none' },
                { registeredTools, agent: { ...outputAgent, options: { structuredOutputMethod: 'functionCalling' } } }
            )
        ).rejects.toThrow('functionCalling')
        expect(fixture.withStructuredOutput).not.toHaveBeenCalled()
    })

    it('allows JSON-mode output with a no-tools choice', async () => {
        const fixture = createModel()
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [], messages, toolChoice: 'none' },
            { registeredTools, agent: outputAgent }
        )
        expect(await prepared.model.invoke(prepared.messages)).toEqual({ title: 'outline' })
        expect(fixture.bindTools).not.toHaveBeenCalled()
    })

    it('preserves block-form system messages when adding JSON instructions', async () => {
        const fixture = createModel()
        const systemMessage = new SystemMessage({ content: [{ type: 'text', text: 'Instructions' }] })
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [], messages, systemMessage },
            { registeredTools, agent: outputAgent }
        )
        expect(prepared.systemMessage.content).toEqual([
            { type: 'text', text: 'Instructions' },
            { type: 'text', text: expect.stringContaining('```json') }
        ])
        expect(systemMessage.content).toHaveLength(1)
    })

    it('applies the same tool selection and choice to fallback while preparing images per model', async () => {
        const primary = createModel(false)
        const fallback = createModel(true)
        primary.invoke.mockRejectedValue(new Error('primary unavailable'))
        const input = [
            new HumanMessage({ content: [{ type: 'image_url', image_url: 'https://example.com/image.png' }] })
        ]
        const prepared = await prepareModelCall(
            { model: primary.model, tools: [second], messages: input, toolChoice: 'required' },
            {
                registeredTools,
                agent: { options: { fallback: { enabled: true, copilotModel: { model: 'fallback' } } } },
                resolveFallbackModel: async () => fallback.model
            }
        )
        await prepared.model.invoke(prepared.messages)
        expect(primary.bindTools).toHaveBeenCalledWith([second], { tool_choice: 'any' })
        expect(fallback.bindTools).toHaveBeenCalledWith([second], { tool_choice: 'any' })
        expect(JSON.stringify(primary.invoke.mock.calls[0][0])).not.toContain('image_url')
        expect(JSON.stringify(fallback.invoke.mock.calls[0][0])).toContain('image_url')
        expect(JSON.stringify(input)).toContain('image_url')
    })

    it('applies structured output to fallback with the same final JSON instructions', async () => {
        const primary = createModel()
        const fallback = createModel()
        primary.withStructuredOutput.mockReturnValue(
            RunnableLambda.from(async () => {
                throw new Error('unavailable')
            })
        )
        const prepared = await prepareModelCall(
            { model: primary.model, tools: [], messages },
            {
                registeredTools,
                agent: {
                    ...outputAgent,
                    options: {
                        ...outputAgent.options,
                        fallback: { enabled: true, copilotModel: { model: 'fallback' } }
                    }
                },
                resolveFallbackModel: async () => fallback.model
            }
        )
        expect(await prepared.model.invoke(prepared.messages)).toEqual({ title: 'outline' })
        expect(fallback.withStructuredOutput).toHaveBeenCalledTimes(1)
        expect(prepared.systemMessage.content).toContain('```json')
    })

    it('reuses one binding across retries', async () => {
        const fixture = createModel()
        fixture.invoke.mockRejectedValueOnce(new Error('transient'))
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [first], messages },
            { registeredTools, agent: { options: { retry: { enabled: true, stopAfterAttempt: 2 } } } }
        )
        await prepared.model.invoke(prepared.messages)
        expect(fixture.invoke).toHaveBeenCalledTimes(2)
        expect(fixture.bindTools).toHaveBeenCalledTimes(1)
    })

    it('keeps independent concurrent requests isolated even when selection arrays are later changed', async () => {
        const fixture = createModel()
        const observedSelections: string[][] = []
        fixture.bindTools.mockImplementation((tools) =>
            RunnableLambda.from(async () => {
                observedSelections.push(tools.map((tool) => tool.name))
                return new AIMessage('response')
            })
        )
        const selection = [first]
        const [one, two] = await Promise.all([
            prepareModelCall({ model: fixture.model, tools: selection, messages }, { registeredTools, agent: {} }),
            prepareModelCall({ model: fixture.model, tools: [second], messages }, { registeredTools, agent: {} })
        ])
        selection.push(second)
        await Promise.all([one.model.invoke(one.messages), two.model.invoke(two.messages)])
        expect(observedSelections).toEqual([[first.name], [second.name]])
    })

    it('retains the configured OpenAI parallel tool call option', async () => {
        const model = new ChatOpenAI({ apiKey: 'test', model: 'gpt-4o' })
        const bind = jest.spyOn(model, 'bindTools')
        await prepareModelCall(
            { model, tools: [first], messages, toolChoice: 'required' },
            { registeredTools, agent: { options: { parallelToolCalls: false } } }
        )
        expect(bind).toHaveBeenCalledWith([first], { tool_choice: 'any', parallel_tool_calls: false })
    })

    it('preserves named OpenAI tool choices that collide with mode names', async () => {
        const model = new ChatOpenAI({ apiKey: 'test', model: 'gpt-4o' })
        const reserved = tool(async () => '', { name: 'none', description: 'Named tool', schema: z.object({}) })
        const bind = jest.spyOn(model, 'bindTools')
        const toolChoice = { type: 'function', function: { name: 'none' } } as const
        await prepareModelCall(
            { model, tools: [reserved], messages, toolChoice },
            { registeredTools: [reserved], agent: {} }
        )
        expect(bind).toHaveBeenCalledWith([reserved], { tool_choice: toolChoice })
    })

    it('rejects ambiguous reserved names for adapters using string tool choices', async () => {
        const fixture = createModel()
        const reserved = tool(async () => '', { name: 'none', description: 'Named tool', schema: z.object({}) })
        await expect(
            prepareModelCall(
                {
                    model: fixture.model,
                    tools: [reserved],
                    messages,
                    toolChoice: { type: 'function', function: { name: 'none' } }
                },
                { registeredTools: [reserved], agent: {} }
            )
        ).rejects.toThrow('reserved tool choice')
        expect(fixture.bindTools).not.toHaveBeenCalled()
    })

    it('returns the configured default response after provider failures', async () => {
        const fixture = createModel()
        fixture.invoke.mockRejectedValue(new Error('unavailable'))
        const prepared = await prepareModelCall(
            { model: fixture.model, tools: [first], messages },
            {
                registeredTools,
                agent: { options: { errorHandling: { type: 'defaultValue', defaultValue: { content: 'default' } } } }
            }
        )
        expect((await prepared.model.invoke(prepared.messages)).content).toBe('default')
        const events = []
        for await (const event of prepared.model.streamEvents(prepared.messages, { version: 'v2' })) {
            events.push(event)
        }
        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    event: 'on_chat_model_end',
                    data: expect.objectContaining({ output: expect.objectContaining({ content: 'default' }) })
                })
            ])
        )
    })

    it('does not turn cancellation into a default response or call another provider', async () => {
        const primary = createModel()
        const fallback = createModel()
        const controller = new AbortController()
        primary.invoke.mockImplementation(async () => {
            controller.abort(new Error('cancelled'))
            throw controller.signal.reason
        })
        const prepared = await prepareModelCall(
            { model: primary.model, tools: [first], messages },
            {
                registeredTools,
                agent: {
                    options: {
                        fallback: { enabled: true, copilotModel: { model: 'fallback' } },
                        errorHandling: { type: 'defaultValue', defaultValue: { content: 'default' } }
                    }
                },
                resolveFallbackModel: async () => fallback.model
            }
        )
        await expect(prepared.model.invoke(prepared.messages, { signal: controller.signal })).rejects.toThrow(
            'cancelled'
        )
        expect(fallback.invoke).not.toHaveBeenCalled()
    })
})
