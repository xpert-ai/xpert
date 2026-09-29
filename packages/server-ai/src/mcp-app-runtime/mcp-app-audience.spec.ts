import { QueryBus } from '@nestjs/cqrs'
import { ApiKeyBindingType, type IApiKey, type IXpertAgentExecution } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assertMcpAppAssistantAudience } from './mcp-app-audience'
import { AssertXpertAgentExecutionAccessQuery } from '../xpert-agent-execution/queries/assert-access.query'

describe('delegated MCP App audience', () => {
    const context = { xpertId: 'expert', conversationId: 'conversation', executionId: 'child', threadId: 'thread' }
    beforeEach(() =>
        jest
            .spyOn(RequestContext, 'currentApiKey')
            .mockReturnValue({ type: ApiKeyBindingType.ASSISTANT, entityId: 'main' } as IApiKey)
    )
    afterEach(() => jest.restoreAllMocks())
    function queries(rows: Record<string, Partial<IXpertAgentExecution>>) {
        const execute = jest.fn(async (query: AssertXpertAgentExecutionAccessQuery) => rows[query.id])
        return { execute, bus: { execute } as unknown as QueryBus }
    }
    it('accepts a persisted multi-hop delegation in the same thread', async () => {
        const f = queries({
            child: { xpertId: 'expert', parentId: 'middle', threadId: 'thread' },
            middle: { xpertId: 'planner', parentId: 'root', threadId: 'thread' },
            root: { xpertId: 'main', threadId: 'thread' }
        })
        await expect(assertMcpAppAssistantAudience(context, f.bus)).resolves.toBeUndefined()
        expect(f.execute).toHaveBeenCalledTimes(3)
        expect(f.execute).toHaveBeenCalledWith(new AssertXpertAgentExecutionAccessQuery('child', 'read', 'thread'))
    })
    it.each([
        { child: { xpertId: 'expert', threadId: 'thread' } },
        { child: { xpertId: 'different-expert', parentId: 'root', threadId: 'thread' } },
        { child: { xpertId: 'expert', parentId: 'root', threadId: 'another-thread' } },
        { child: { xpertId: 'expert', parentId: 'child', threadId: 'thread' } },
        { child: { xpertId: 'expert', parentId: 'missing', threadId: 'thread' } }
    ])('rejects unrelated, cross-thread, missing and cyclic execution chains', async (rows) => {
        const f = queries({ root: { xpertId: 'main', threadId: 'thread' }, ...rows })
        await expect(assertMcpAppAssistantAudience(context, f.bus)).rejects.toThrow()
    })
    it('does not bypass revoked execution access', async () => {
        const f = queries({})
        f.execute.mockRejectedValue(new Error('access revoked'))
        await expect(assertMcpAppAssistantAudience(context, f.bus)).rejects.toThrow('access revoked')
    })
    it('preserves direct Assistant and user JWT behavior', async () => {
        const f = queries({})
        await assertMcpAppAssistantAudience({ ...context, xpertId: 'main' }, f.bus)
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(undefined)
        await assertMcpAppAssistantAudience(context, f.bus)
        expect(f.execute).not.toHaveBeenCalled()
    })
})
