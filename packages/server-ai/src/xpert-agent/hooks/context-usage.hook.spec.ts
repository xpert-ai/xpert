import { AIMessage } from '@langchain/core/messages'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { createThreadContextUsageEventHook, createThreadContextUsageEvent } from './context-usage.hook'

it('reports the context window from the effective execution snapshot', () => {
    const event = createThreadContextUsageEvent({
        threadId: 'thread',
        agentKey: 'agent',
        message: new AIMessage({
            content: 'done',
            usage_metadata: { input_tokens: 120, output_tokens: 30, total_tokens: 150 }
        }),
        execution: { metadata: { effectiveModelSnapshot: { model: 'small', options: { context_size: 32768 } } } }
    })
    expect(event?.effectiveModel).toEqual({ model: 'small', contextWindow: 32768 })
    expect(event?.usage.contextTokens).toBe(120)
})

jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))

it('uses the active snapshot when the execution loader has not saved new metadata yet', async () => {
    const snapshot = { model: 'selected', options: { context_size: 32768 } }
    const loader = jest.fn(async () => ({ id: 'execution', metadata: {}, totalPrice: 0.5 }))
    const { hook } = createThreadContextUsageEventHook({ key: 'Agent' }, 'thread', loader, () => snapshot)
    await hook(
        {
            messages: [
                new AIMessage({
                    content: 'done',
                    usage_metadata: { input_tokens: 120, output_tokens: 30, total_tokens: 150 }
                })
            ]
        },
        {}
    )
    expect(loader).toHaveBeenCalled()
    expect(dispatchCustomEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
            effectiveModel: { model: 'selected', contextWindow: 32768 },
            usage: expect.objectContaining({ totalPrice: 0.5 })
        })
    )
})
