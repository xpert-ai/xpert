import { HumanMessage } from '@langchain/core/messages'
import { BadRequestException } from '@nestjs/common'
import { ModelFeature, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import {
    assertRequestCapabilities,
    parseOpenAIChatRequest,
    responseUsage,
    toLangChainMessages
} from './openai-adapter'

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
        const usage = responseUsage(
            [new HumanMessage('Hello')],
            'World',
            { promptTokens: 10, completionTokens: 4, totalTokens: 14 }
        )

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
})
