import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { ToolMessage } from '@langchain/core/messages'
import { createTemplateOperationPolicy } from './template-operation-policy'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'

const mockInterrupt = jest.fn()
jest.mock('@langchain/langgraph', () => ({ interrupt: (...args: unknown[]) => mockInterrupt(...args) }))
type Request = Parameters<NonNullable<AgentMiddleware['wrapToolCall']>>[0]
const request = (name = 'write_record'): Request => ({
    toolCall: { id: 'call-1', name, args: { title: 'reviewed value' }, type: 'tool_call' },
    tool: tool(async () => 'ok', { name, description: 'Test', schema: z.object({ title: z.string() }) }),
    state: { messages: [] },
    runtime: {}
})

describe('Assistant operation policy at execution', () => {
    beforeEach(() => mockInterrupt.mockReset())
    it('rejects writes without calling the side effect', async () => {
        mockInterrupt.mockReturnValue({ decisions: [{ type: 'reject' }] })
        const middleware = createTemplateOperationPolicy({
            default: 'allow',
            rules: [{ tool: 'write_record', decision: 'approve', reason: 'Review the write' }]
        })
        const sideEffect = jest.fn()
        const response = await middleware.wrapToolCall(request(), sideEffect)
        expect(response).toBeInstanceOf(ToolMessage)
        expect(sideEffect).not.toHaveBeenCalled()
        expect(mockInterrupt.mock.calls[0][0].actionRequests[0].args).toEqual({ title: 'reviewed value' })
    })
    it('executes the exact approved call once', async () => {
        mockInterrupt.mockReturnValue({ decisions: [{ type: 'approve' }] })
        const middleware = createTemplateOperationPolicy({ default: 'approve', rules: [] })
        const sideEffect = jest.fn().mockResolvedValue('stored')
        const call = request()
        expect(await middleware.wrapToolCall(call, sideEffect)).toBe('stored')
        expect(sideEffect).toHaveBeenCalledTimes(1)
        expect(sideEffect).toHaveBeenCalledWith(call)
    })
    it('denies unknown tools under a closed policy and never prompts', async () => {
        const middleware = createTemplateOperationPolicy({
            default: 'deny',
            rules: [{ tool: 'read_record', decision: 'allow', reason: 'Read only' }]
        })
        const sideEffect = jest.fn()
        await middleware.wrapToolCall(request(), sideEffect)
        expect(sideEffect).not.toHaveBeenCalled()
        expect(mockInterrupt).not.toHaveBeenCalled()
        await middleware.wrapToolCall(request('read_record'), sideEffect)
        expect(sideEffect).toHaveBeenCalledTimes(1)
    })
    it.each([
        { decisions: [] },
        { decisions: [{ type: 'edit', editedAction: { name: 'other' } }] },
        { decisions: [{ type: 'approve' }, { type: 'approve' }] }
    ])('fails closed for malformed approval %j', async (response) => {
        mockInterrupt.mockReturnValue(response)
        const middleware = createTemplateOperationPolicy({ default: 'approve', rules: [] })
        const sideEffect = jest.fn()
        await expect(middleware.wrapToolCall(request(), sideEffect)).rejects.toThrow()
        expect(sideEffect).not.toHaveBeenCalled()
    })
})
