import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { BadRequestException } from '@nestjs/common'
import { ModelFeature, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { assertRequestCapabilities, parseOpenAIChatRequest, responseUsage, toLangChainMessages } from './openai-adapter'

describe('OpenAI model gateway adapter', () => {
    it('parses the supported chat completion fields', () => {
        const parsed = parseOpenAIChatRequest({
            model: 'tenant-chat',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0.2,
            max_completion_tokens: 128,
            n: 1
        })

        expect(parsed).toMatchObject({
            model: 'tenant-chat',
            stream: true,
            streamIncludeUsage: true,
            options: {
                temperature: 0.2,
                max_tokens: 128
            }
        })
    })

    it('rejects unsupported request fields explicitly', () => {
        expect(() =>
            parseOpenAIChatRequest({
                model: 'tenant-chat',
                messages: [{ role: 'user', content: 'Hello' }],
                response_format: { type: 'json_object' }
            })
        ).toThrow(BadRequestException)
    })

    it('accepts Kimi cache hints without forwarding a client-controlled cache identity', () => {
        const request = {
            model: 'assistant-default',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: true,
            max_tokens: 16384
        }
        expect(parseOpenAIChatRequest({ ...request, prompt_cache_key: 'cli-session' })).toEqual(
            parseOpenAIChatRequest(request)
        )
        expect(() => parseOpenAIChatRequest({ ...request, prompt_cache_key: { session: 'invalid' } })).toThrow(
            BadRequestException
        )
    })

    it('requires declared tool, parallel, streaming and image capabilities', () => {
        const parsed = parseOpenAIChatRequest({
            model: 'tenant-chat',
            stream: true,
            parallel_tool_calls: true,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'lookup',
                        parameters: { type: 'object', properties: {} }
                    }
                }
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is this?' },
                        { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
                    ]
                }
            ]
        })

        expect(() => assertRequestCapabilities(parsed, [])).toThrow(BadRequestException)
        expect(() =>
            assertRequestCapabilities(parsed, [
                ModelFeature.TOOL_CALL,
                ModelFeature.MULTI_TOOL_CALL,
                ModelFeature.STREAM_TOOL_CALL,
                ModelFeature.VISION
            ])
        ).not.toThrow()
        // Existing providers declare multi/stream tool calling without repeating the single-call flag.
        expect(() =>
            assertRequestCapabilities(parsed, [
                ModelFeature.MULTI_TOOL_CALL,
                ModelFeature.STREAM_TOOL_CALL,
                ModelFeature.VISION
            ])
        ).not.toThrow()
        expect(() => assertRequestCapabilities(parsed, [ModelFeature.TOOL_CALL, ModelFeature.VISION])).toThrow()
    })

    it('converts OpenAI messages to LangChain messages', () => {
        const parsed = parseOpenAIChatRequest({
            model: 'tenant-chat',
            messages: [
                { role: 'system', content: 'Be concise.' },
                { role: 'user', content: 'Hello' }
            ]
        })

        const messages = toLangChainMessages(parsed.messages)

        expect(messages).toHaveLength(2)
        expect(messages[1]).toBeInstanceOf(HumanMessage)
        expect(messages[1].content).toBe('Hello')
    })

    it('prefers provider usage over token estimation', () => {
        const usage = responseUsage([new HumanMessage('Hello')], 'World', {
            promptTokens: 10,
            completionTokens: 4,
            totalTokens: 14
        })

        expect(usage).toEqual({
            inputTokens: 10,
            outputTokens: 4,
            totalTokens: 14,
            source: ModelGatewayUsageSourceEnum.Provider
        })
    })

    it('estimates text usage locally when the provider omits usage', () => {
        const usage = responseUsage([new HumanMessage('Hello')], '模型响应')

        expect(usage.inputTokens).toBeGreaterThan(0)
        expect(usage.outputTokens).toBeGreaterThan(0)
        expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens)
        expect(usage.source).toBe(ModelGatewayUsageSourceEnum.Estimated)
    })

    it('does not expose an explicitly unpriced receipt as a free model call', () => {
        const receipt = {
            promptTokens: 10,
            completionTokens: 4,
            totalTokens: 14,
            totalPrice: 0,
            currency: 'USD',
            pricingStatus: 'unpriced' as const
        }
        const usage = responseUsage([], '', receipt)
        expect(usage.source).toBe(ModelGatewayUsageSourceEnum.Provider)
        expect(usage.totalTokens).toBe(14)
        expect(usage.priceAmount).toBeUndefined()
        expect(usage.priceCurrency).toBeUndefined()
    })

    it.each(['cacheReadInputTokens', 'cacheWriteInputTokens', 'reasoningTokens'] as const)(
        'does not reuse a price calculated with different %s counts',
        (detail) => {
            const receipt = {
                promptTokens: 20,
                completionTokens: 5,
                totalTokens: 25,
                totalPrice: 0.01,
                currency: 'USD',
                cacheReadInputTokens: 2,
                cacheWriteInputTokens: 2,
                reasoningTokens: 2,
                [detail]: 1
            }
            const response = new AIMessage({
                content: 'done',
                usage_metadata: {
                    input_tokens: 20,
                    output_tokens: 5,
                    total_tokens: 25,
                    input_token_details: { cache_read: 2, cache_creation: 2 },
                    output_token_details: { reasoning: 2 }
                }
            })
            const usage = responseUsage([], 'done', receipt, response)
            expect(usage).toMatchObject({
                inputTokens: 20,
                outputTokens: 5,
                totalTokens: 25,
                cacheReadInputTokens: 2,
                cacheWriteInputTokens: 2,
                reasoningTokens: 2,
                source: ModelGatewayUsageSourceEnum.Provider
            })
            expect(usage.priceAmount).toBeUndefined()
        }
    )

    it('preserves a verified free price and rejects prices attached to estimates', () => {
        const receipt = {
            promptTokens: 10,
            completionTokens: 4,
            totalTokens: 14,
            totalPrice: 0,
            currency: 'USD',
            pricingStatus: 'free' as const
        }
        expect(responseUsage([], '', receipt)).toMatchObject({ priceAmount: 0, priceCurrency: 'USD' })
        expect(responseUsage([], '', { ...receipt, type: 'estimated' })).toMatchObject({
            source: ModelGatewayUsageSourceEnum.Estimated,
            priceAmount: undefined
        })
    })

    it('retains the quote when canonical counts and all price-relevant details agree', () => {
        const receipt = {
            promptTokens: 20,
            completionTokens: 5,
            totalTokens: 25,
            totalPrice: 0.01,
            currency: 'USD',
            cacheReadInputTokens: 2,
            cacheWriteInputTokens: 2,
            reasoningTokens: 2
        }
        const response = new AIMessage({
            content: 'done',
            usage_metadata: {
                input_tokens: 20,
                output_tokens: 5,
                total_tokens: 25,
                input_token_details: { cache_read: 2, cache_creation: 2 },
                output_token_details: { reasoning: 2 }
            }
        })
        expect(responseUsage([], 'done', receipt, response)).toMatchObject({
            source: ModelGatewayUsageSourceEnum.Provider,
            priceAmount: 0.01,
            priceCurrency: 'USD'
        })
    })
})
