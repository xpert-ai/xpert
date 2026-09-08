import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { GraphInterrupt } from '@langchain/langgraph'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import {
    ModelRequestStateError,
    modelRequestFailureUpdate,
    throwPendingModelRequestFailure,
    preserveModelRequestState,
    withModelRequestValidation
} from './model-request-state'

describe('model request state boundary', () => {
    it('validates the assembled messages actually passed to the model, not a stale request copy', async () => {
        const invoke = jest.fn(async () => new AIMessage('unused'))
        const request: ModelRequest = {
            model: new FakeListChatModel({ responses: ['unused'] }),
            messages: [new HumanMessage('original')],
            tools: [],
            state: { messages: [] },
            runtime: {},
            validateRequest: (candidate) => {
                expect(candidate.finalMessages?.[0].content).toBe('replaced downstream')
                throw new Error('rejected final context')
            }
        }
        const model = withModelRequestValidation(RunnableLambda.from(invoke), () => request, { model: 'primary' })
        await expect(model.invoke([new HumanMessage('replaced downstream')])).rejects.toThrow('rejected final context')
        expect(invoke).not.toHaveBeenCalled()
    })
    it('allows an explicit new execution to retry a failed checkpoint with saved compression state', () => {
        const state = modelRequestFailureUpdate(
            new ModelRequestStateError(new Error('temporary failure'), { retry: true }),
            'run-1'
        )
        expect(() => throwPendingModelRequestFailure(state, 'run-1')).toThrow('temporary failure')
        expect(throwPendingModelRequestFailure(state, 'run-2')).toEqual({
            __modelRequestFailure: null,
            jumpTo: 'model'
        })
        expect(state).toEqual(expect.objectContaining({ retry: true }))
    })

    it('keeps intentional graph interrupts and cancellation intact', () => {
        for (const error of [new GraphInterrupt([]), Object.assign(new Error('cancelled'), { name: 'AbortError' })]) {
            try {
                preserveModelRequestState(error, { retry: true })
            } catch (caught) {
                expect(caught).toBe(error)
            }
        }
    })

    it('retains the innermost prepared state when wrapping an already captured error', () => {
        try {
            preserveModelRequestState(new ModelRequestStateError(new Error('provider failed'), { marker: 'inner' }), {
                marker: 'outer',
                retry: true
            })
        } catch (error) {
            expect(error).toBeInstanceOf(ModelRequestStateError)
            if (error instanceof ModelRequestStateError)
                expect(error.agentStateUpdate).toEqual({ marker: 'inner', retry: true })
        }
    })

    it('lets a configured default-value fallback handle validation errors', async () => {
        const invoke = jest.fn(async () => new AIMessage('provider'))
        const request: ModelRequest = {
            model: new FakeListChatModel({ responses: ['unused'] }),
            messages: [new HumanMessage('large')],
            tools: [],
            state: { messages: [] },
            runtime: {},
            validateRequest: () => {
                throw new Error('over budget')
            }
        }
        const model = withModelRequestValidation(RunnableLambda.from(invoke), () => request, {
            model: 'primary'
        }).withFallbacks([RunnableLambda.from(async () => new AIMessage('configured default'))])
        expect((await model.invoke(request.messages)).content).toBe('configured default')
        expect(invoke).not.toHaveBeenCalled()
    })

    it('checks the fallback own model limits before entering its provider', async () => {
        const primary = jest.fn(async () => {
            throw new Error('provider unavailable')
        })
        const fallback = jest.fn(async () => new AIMessage('fallback'))
        const checked: number[] = []
        const request: ModelRequest = {
            model: new FakeListChatModel({ responses: ['unused'] }),
            messages: [new HumanMessage('large')],
            tools: [],
            state: { messages: [] },
            runtime: {},
            validateRequest: (candidate) => {
                const size = candidate.runtime.configurable?.copilotModel?.options?.context_size ?? 0
                checked.push(size)
                if (size < 50000) throw new Error('over budget')
            }
        }
        const model = withModelRequestValidation(RunnableLambda.from(primary), () => request, {
            options: { context_size: 131072 }
        }).withFallbacks([
            withModelRequestValidation(RunnableLambda.from(fallback), () => request, {
                options: { context_size: 32768 }
            })
        ])
        await expect(model.invoke(request.messages)).rejects.toThrow()
        expect(checked).toEqual([131072, 32768])
        expect(primary).toHaveBeenCalledTimes(1)
        expect(fallback).not.toHaveBeenCalled()
    })
})
