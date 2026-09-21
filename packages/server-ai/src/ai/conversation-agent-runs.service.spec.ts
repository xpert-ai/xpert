jest.mock('../xpert-agent-execution/agent-execution.service', () => ({ XpertAgentExecutionService: class {} }))
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { ConversationAgentRunsService, toAgentRunSummary } from './conversation-agent-runs.service'
import type { XpertAgentExecutionService } from '../xpert-agent-execution/agent-execution.service'

describe('conversation agent run history', () => {
    it('expands only authorized message roots and keeps each descendant in its original thread', async () => {
        const find = jest
            .fn()
            .mockResolvedValueOnce({ items: [{ id: 'root', threadId: 'source-thread' }] })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'external',
                        parentId: 'root',
                        threadId: 'source-thread',
                        category: 'agent',
                        metadata: { invocationKind: 'external_assistant', assistantName: 'Reviewer', model: 'model-a' },
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
                        metadata: { invocationKind: 'sub_agent' }
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
            expect.objectContaining({
                id: 'external',
                invocationKind: 'external_assistant',
                model: 'model-a',
                avatar: { emoji: { id: 'memo', unified: '1f4dd' } }
            }),
            expect.objectContaining({ id: 'sub', invocationKind: 'sub_agent' })
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

    it('exposes only presentation metadata and leaves legacy executions unclassified', () => {
        const summary = toAgentRunSummary({
            id: 'legacy',
            category: 'agent',
            metadata: { model: 'model-b', privateValue: 'must-not-leak' },
            createdAt: new Date('2026-01-01')
        })
        expect(summary.invocationKind).toBeUndefined()
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
