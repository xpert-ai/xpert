jest.mock('../xpert-agent-execution/agent-execution.service', () => ({ XpertAgentExecutionService: class {} }))
import { STATE_VARIABLE_TITLE_CHANNEL, XpertTypeEnum } from '@xpert-ai/contracts'
import * as presentation from './runtime-presentation'
import { ConversationAgentRunsService, toAgentRunSummary } from './conversation-agent-runs.service'
import type { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'

describe('conversation agent run history', () => {
    beforeEach(() => {
        jest.spyOn(presentation, 'usesRuntimePresentation').mockReturnValue(false)
    })
    afterEach(() => jest.restoreAllMocks())

    it.each([false, true])('omits runtime and legacy title runs in history (restricted=%s)', async (restricted) => {
        jest.spyOn(presentation, 'usesRuntimePresentation').mockReturnValue(restricted)
        const common = { category: 'agent', parentId: 'root', threadId: 'thread', status: 'success' }
        const find = jest
            .fn()
            .mockResolvedValueOnce({ items: [{ id: 'root', threadId: 'thread' }] })
            .mockResolvedValueOnce({
                items: [
                    { ...common, id: 'internal', metadata: { presentation: 'runtime' } },
                    { ...common, id: 'old-title', channelName: STATE_VARIABLE_TITLE_CHANNEL },
                    { ...common, id: 'visible', title: '总结标题' },
                    {
                        ...common,
                        id: 'explicit',
                        channelName: STATE_VARIABLE_TITLE_CHANNEL,
                        metadata: { presentation: 'event' }
                    }
                ]
            })
            .mockResolvedValueOnce({ items: [] })
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        const result = await service.forMessages([{ id: 'reply', role: 'ai', executionId: 'root' }], ['thread'])
        expect(find.mock.calls[1][0].select).toMatchObject({ metadata: true, channelName: true })
        expect(result.get('reply')?.map((run) => run.id)).toEqual(['root', 'visible', 'explicit'])
    })

    it('filters a legacy branch copy by its stored run IDs, preserving other snapshots and root timing', async () => {
        const find = jest.fn().mockResolvedValue({ items: [{ id: 'old-title' }] })
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        const root = { id: 'root', isRoot: true, elapsedTime: 1300 }
        const visible = { id: 'business', title: '总结标题' }
        const runs = [root, { id: 'old-title' }, visible, { id: 'missing-source' }]
        const copy = { historicalAgentRuns: runs, agentRuns: runs }
        const versioned = { historicalAgentRuns: { version: 1 as const, runs }, agentRuns: runs }
        const explicit = [{ id: 'old-title', presentation: 'event' as const }]
        const transitional = { historicalAgentRuns: explicit, agentRuns: explicit }
        await service.filterCopiedHistory([copy, versioned, transitional, { agentRuns: [{ id: 'unrelated' }] }])
        expect(find).toHaveBeenCalledTimes(1)
        const query = find.mock.calls[0][0]
        for (const condition of query.where)
            expect(condition.id.value).toEqual(['old-title', 'business', 'missing-source'])
        expect(query.where[1].channelName).toBe(STATE_VARIABLE_TITLE_CHANNEL)
        expect(query).toMatchObject({ select: ['id'], withDeleted: true })
        expect(copy.agentRuns).toEqual([root, visible, { id: 'missing-source' }])
        expect(versioned.agentRuns).toBe(runs)
        expect(transitional.agentRuns).toEqual(explicit)
    })

    it('opens a versioned branch without looking up any original execution', async () => {
        const find = jest.fn()
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        const runs = [{ id: 'business', title: '总结标题' }]
        const copy = { historicalAgentRuns: { version: 1 as const, runs }, agentRuns: runs }
        await service.filterCopiedHistory([copy])
        expect(find).not.toHaveBeenCalled()
        expect(copy.agentRuns).toEqual(runs)
    })

    it('expands only authorized message roots and keeps each descendant in its original thread', async () => {
        const find = jest
            .fn()
            .mockResolvedValueOnce({ items: [{ id: 'root', threadId: 'source-thread', elapsedTime: 479000 }] })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'external',
                        parentId: 'root',
                        threadId: 'source-thread',
                        category: 'agent',
                        metadata: {
                            invocationKind: 'external_assistant',
                            sourceToolCallId: 'call-1',
                            assistantName: 'Reviewer',
                            model: 'model-a'
                        },
                        xpert: { id: 'reviewer', avatar: { emoji: { id: 'memo', unified: '1f4dd' } } }
                    },
                    { id: 'wrong-thread', parentId: 'root', threadId: 'other-thread', category: 'agent' }
                ]
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'sub',
                        parentId: 'external',
                        threadId: 'source-thread',
                        category: 'agent',
                        metadata: { invocationKind: 'sub_agent', sourceToolCallId: 'call-2' }
                    },
                    { id: 'root', parentId: 'external', threadId: 'source-thread', category: 'agent' }
                ]
            })
            .mockResolvedValueOnce({ items: [] })
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        const result = await service.forMessages(
            [
                { id: 'message', role: 'ai', executionId: 'root', createdInThreadId: 'source-thread' },
                { id: 'human', role: 'human', executionId: 'root' },
                { id: 'sibling', role: 'ai', executionId: 'root', createdInThreadId: 'sibling-thread' }
            ],
            ['source-thread', 'sibling-thread']
        )
        expect(find.mock.calls[0][0].where.id.value).toEqual(['root'])
        expect(find.mock.calls[0][0].where.threadId.value).toEqual(['source-thread', 'sibling-thread'])
        expect(result.get('message')).toEqual([
            expect.objectContaining({ id: 'root', isRoot: true, elapsedTime: 479000 }),
            expect.objectContaining({
                id: 'external',
                invocationKind: 'external_assistant',
                parentId: 'root',
                sourceToolCallId: 'call-1',
                model: 'model-a',
                avatar: { emoji: { id: 'memo', unified: '1f4dd' } }
            }),
            expect.objectContaining({
                id: 'sub',
                invocationKind: 'sub_agent',
                parentId: 'external',
                sourceToolCallId: 'call-2'
            })
        ])
        expect(result.has('human')).toBe(false)
        expect(result.has('sibling')).toBe(false)
        expect(find).toHaveBeenCalledTimes(4)
        expect(find.mock.calls[1][0].select.xpert).toEqual({ id: true, avatar: true })
    })

    it('does not query for human-only pages or without an authorized thread scope', async () => {
        const find = jest.fn()
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        await service.forMessages([{ id: 'h', role: 'human', executionId: 'root' }], ['thread'])
        await service.forMessages([{ id: 'a', role: 'ai', executionId: 'root' }], [])
        expect(find).not.toHaveBeenCalled()
    })

    it('returns root timing even when a reply has no sub-agents', async () => {
        const find = jest
            .fn()
            .mockResolvedValueOnce({ items: [{ id: 'root', threadId: 'thread', elapsedTime: 1200 }] })
            .mockResolvedValueOnce({ items: [] })
        const service = new ConversationAgentRunsService({
            findAllInOrganizationOrTenant: find
        } as unknown as XpertAgentExecutionService)
        const result = await service.forMessages([{ id: 'a', role: 'ai', executionId: 'root' }], ['thread'])
        expect(result.get('a')).toEqual([expect.objectContaining({ isRoot: true, elapsedTime: 1200 })])
    })

    it('exposes the server business result in history without converting runtime success to task acceptance', () => {
        const outcome = { status: 'not_claimed' as const, subjectId: 'task', accepted: false }
        const summary = toAgentRunSummary({ id: 'child', metadata: { businessOutcome: outcome } })
        expect(summary.businessOutcome).toEqual(outcome)
    })

    it('exposes only presentation metadata and leaves legacy executions unclassified', () => {
        const summary = toAgentRunSummary({
            id: 'legacy',
            category: 'agent',
            metadata: { model: 'model-b', privateValue: 'must-not-leak' },
            createdAt: new Date('2026-01-01')
        })
        expect(summary.invocationKind).toBeUndefined()
        expect(summary.sourceToolCallId).toBeUndefined()
        expect(summary.model).toBe('model-b')
        expect(summary.createdAt).toBe('2026-01-01T00:00:00.000Z')
        expect(summary).not.toHaveProperty('metadata')
    })

    it('prefers the execution avatar snapshot and handles removed experts', () => {
        const snapshot = { url: '/avatars/reviewer.png' }
        expect(
            toAgentRunSummary({
                id: 'external',
                metadata: { assistantAvatar: snapshot },
                xpert: {
                    slug: 'reviewer',
                    name: 'Reviewer',
                    type: XpertTypeEnum.Agent,
                    avatar: { emoji: { id: 'memo', unified: '1f4dd' } }
                }
            }).avatar
        ).toEqual(snapshot)
        expect(toAgentRunSummary({ id: 'removed' }).avatar).toBeUndefined()
    })
})
