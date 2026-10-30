import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { IAgentMiddlewareContext, ModelRequest } from '@xpert-ai/plugin-sdk'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { LLMToolSelectorNameMiddleware } from './llm-tool-selector.middleware'

jest.mock('@xpert-ai/plugin-sdk', () => ({ AgentMiddlewareStrategy: () => (target: unknown) => target }))

it('keeps an enabled recovery tool available even when the selector chooses another tool', async () => {
    const recovery = tool(async () => 'source', {
        name: 'read_context_evidence',
        description: 'Read archived history',
        schema: z.object({})
    })
    const lookup = tool(async () => 'lookup', { name: 'lookup', description: 'Lookup', schema: z.object({}) })
    const context = {
        runtime: {
            createModelClient: async () => ({
                withStructuredOutput: () => ({ invoke: async () => ({ tools: ['lookup'] }) })
            }),
            wrapWorkflowNodeExecution: async (run: () => Promise<{ state: { tools: string[] } }>) => (await run()).state
        },
        node: { key: 'selector', title: 'Selector' }
    } as unknown as IAgentMiddlewareContext
    const middleware = await new LLMToolSelectorNameMiddleware().createMiddleware(
        {
            model: { model: 'selector', modelType: AiModelTypeEnum.LLM },
            maxTools: 1
        },
        context
    )
    if (!middleware.wrapModelCall) throw new Error('Missing selector')
    const request = {
        tools: [lookup, recovery],
        messages: [new HumanMessage('Continue')],
        runtime: { context: {}, configurable: {} }
    } as unknown as ModelRequest
    const handler = jest.fn(async (_request: ModelRequest) => new AIMessage('done'))
    await middleware.wrapModelCall(request, handler)
    expect(handler.mock.calls[0][0].tools.map((candidate) => candidate.name)).toEqual([
        'lookup',
        'read_context_evidence'
    ])
    await middleware.wrapModelCall({ ...request, tools: [lookup] }, handler)
    expect(handler.mock.calls[1][0].tools.map((candidate) => candidate.name)).toEqual(['lookup'])
})
