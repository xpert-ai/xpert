import { HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ChatOAICompatReasoningModel } from '../../../../plugin-sdk/src/lib/ai-model/openai-compatible/completions'
import { prepareModelCall } from './model-call'

describe('OpenAI-compatible parallel tool request parameters', () => {
    it.each([
        { enabled: true, streaming: false },
        { enabled: false, streaming: false },
        { enabled: undefined, streaming: false },
        { enabled: true, streaming: true },
        { enabled: false, streaming: true },
        { enabled: undefined, streaming: true }
    ])('sends parallel=$enabled with streaming=$streaming', async ({ enabled, streaming }) => {
        const bodies: string[] = []
        const model = new ChatOAICompatReasoningModel({
            apiKey: 'offline-test',
            model: 'qwen3.6-plus',
            maxRetries: 0,
            streaming,
            configuration: {
                baseURL: 'https://offline.invalid/v1',
                fetch: async (_url, init) => {
                    if (typeof init?.body !== 'string') throw new Error('Expected JSON request')
                    bodies.push(init.body)
                    if (streaming) {
                        const chunk = {
                            id: 'offline',
                            object: 'chat.completion.chunk',
                            created: 1,
                            model: 'qwen3.6-plus',
                            choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }]
                        }
                        return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
                            status: 200,
                            headers: { 'content-type': 'text/event-stream' }
                        })
                    }
                    return new Response(
                        JSON.stringify({
                            id: 'offline',
                            object: 'chat.completion',
                            created: 1,
                            model: 'qwen3.6-plus',
                            choices: [
                                { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }
                            ],
                            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
                        }),
                        { status: 200, headers: { 'content-type': 'application/json' } }
                    )
                }
            }
        })
        const tools = [
            tool(async () => 'done', {
                name: 'delegate_chapter',
                description: 'Delegate independent chapter',
                schema: z.object({ chapter: z.string() })
            })
        ]
        const prepared = await prepareModelCall(
            { model, messages: [new HumanMessage('Write two independent chapters')], tools },
            { registeredTools: tools, agent: { options: { parallelToolCalls: enabled } } }
        )
        if (streaming) {
            const stream = await prepared.model.stream(prepared.messages)
            for await (const _chunk of stream) {
                /* Consume the actual SDK request and SSE response. */
            }
        } else {
            await prepared.model.invoke(prepared.messages)
        }
        expect(bodies).toHaveLength(1)
        const sent: { parallel_tool_calls?: boolean; stream: boolean } = JSON.parse(bodies[0])
        expect(sent.parallel_tool_calls).toBe(enabled)
        expect(sent.stream).toBe(streaming)
    })
})
