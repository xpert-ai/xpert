jest.mock('i18next', () => ({
    t: jest.fn((key: string) => `translated:${key}`)
}))

import { ChatTaskSummaryService } from './task-summary.service'
import type { ChatConversation } from './conversation.entity'

describe('ChatTaskSummaryService', () => {
    it('backfills legacy messages without events and returns three-item previews with totals', async () => {
        const legacyMessage = {
            id: 'legacy-1',
            content: '<proposed_plan># Legacy plan\nRestore this summary.</proposed_plan>',
            createdAt: new Date('2026-07-13T00:00:00.000Z'),
            updatedAt: new Date('2026-07-13T00:00:00.000Z')
        }
        const messages = [
            {
                id: 'message-2',
                taskSummary: {
                    version: 1 as const,
                    outputs: Array.from({ length: 4 }, (_, index) => ({
                        id: `output-${index + 1}`,
                        kind: 'document' as const,
                        title: `Output ${index + 1}`,
                        updatedAt: `2026-07-13T0${index + 1}:00:00.000Z`
                    })),
                    sources: [
                        {
                            id: 'sub-agent:Agent_researcher',
                            kind: 'sub_agent' as const,
                            title: 'Agent_researcher'
                        },
                        { id: 'attachment:file-1', kind: 'attachment' as const, title: 'brief.pdf' }
                    ]
                },
                followUpStatus: 'pending' as const,
                followUpMode: 'queue' as const,
                createdAt: new Date('2026-07-13T05:00:00.000Z'),
                updatedAt: new Date('2026-07-13T05:00:00.000Z')
            }
        ]
        let backfillReadCount = 0
        const messageService = {
            findAllInOrganizationOrTenant: jest.fn((options: { where?: { taskSummary?: unknown } }) => {
                if (options.where && 'taskSummary' in options.where) {
                    backfillReadCount += 1
                    return Promise.resolve({
                        items: backfillReadCount === 1 ? [legacyMessage] : [],
                        total: backfillReadCount === 1 ? 1 : 0
                    })
                }
                return Promise.resolve({ items: messages, total: messages.length })
            }),
            save: jest.fn((message) => Promise.resolve(message))
        }
        const goalService = {
            getByConversationId: jest.fn(() => Promise.resolve(null))
        }
        const executionService = {
            findAllInOrganizationOrTenant: jest.fn(() =>
                Promise.resolve({
                    items: [
                        {
                            id: 'root-agent',
                            agentKey: 'Agent_primary',
                            title: 'Primary agent',
                            status: 'running',
                            updatedAt: new Date('2026-07-13T05:00:00.000Z')
                        },
                        {
                            id: 'agent-1',
                            parentId: 'root-agent',
                            agentKey: 'Agent_researcher',
                            title: 'Researcher',
                            status: 'error',
                            updatedAt: new Date('2026-07-13T03:00:00.000Z')
                        },
                        {
                            id: 'agent-2',
                            parentId: 'root-agent',
                            agentKey: 'Agent_researcher',
                            title: 'Researcher',
                            status: 'success',
                            updatedAt: new Date('2026-07-13T04:00:00.000Z')
                        },
                        {
                            id: 'agent-3',
                            parentId: 'root-agent',
                            agentKey: 'Agent_writer',
                            title: 'Writer',
                            status: 'success',
                            updatedAt: new Date('2026-07-13T03:30:00.000Z')
                        }
                    ],
                    total: 1
                })
            )
        }
        const service = new ChatTaskSummaryService(
            messageService as never,
            goalService as never,
            executionService as never,
            {
                find: jest.fn(() =>
                    Promise.resolve([
                        { key: 'Agent_researcher', name: 'researcher' },
                        { key: 'Agent_writer', name: 'writer' }
                    ])
                )
            } as never
        )

        const result = await service.getSnapshot(conversation())

        expect(messageService.findAllInOrganizationOrTenant).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                select: ['id', 'content', 'references', 'thirdPartyMessage', 'createdAt', 'updatedAt'],
                take: 100
            })
        )
        expect(messageService.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'legacy-1',
                taskSummary: expect.objectContaining({ version: 1 })
            })
        )
        expect(result.outputs.items).toHaveLength(3)
        expect(result.outputs.total).toBe(4)
        expect(result.sources).toEqual({
            items: [{ id: 'attachment:file-1', kind: 'attachment', title: 'brief.pdf' }],
            total: 1
        })
        expect(result.agents).toEqual({
            items: [
                expect.objectContaining({ id: 'agent-2', title: 'researcher', status: 'success' }),
                expect.objectContaining({ id: 'agent-3', title: 'writer', status: 'success' })
            ],
            total: 2
        })
        expect(result.agents.items).not.toContainEqual(expect.objectContaining({ id: 'root-agent' }))
        expect(result.pending.items[0]).toMatchObject({
            id: 'follow-up:message-2',
            kind: 'follow_up',
            title: 'translated:server-ai:ChatTaskSummary.PendingFollowUpMessage'
        })
    })

    it('deduplicates newer contributions and caps section pages at 50', async () => {
        const outputs = Array.from({ length: 60 }, (_, index) => ({
            id: `output-${index}`,
            kind: 'document' as const,
            title: `Output ${index}`,
            updatedAt: `2026-07-13T01:${String(index).padStart(2, '0')}:00.000Z`
        }))
        outputs.push({
            id: 'output-1',
            kind: 'document',
            title: 'Newest output',
            updatedAt: '2026-07-13T03:00:00.000Z'
        })
        const messageService = {
            findAllInOrganizationOrTenant: jest
                .fn()
                .mockResolvedValueOnce({ items: [], total: 0 })
                .mockResolvedValueOnce({
                    items: [{ id: 'message-1', taskSummary: { version: 1, outputs } }],
                    total: 1
                }),
            save: jest.fn()
        }
        const service = new ChatTaskSummaryService(
            messageService as never,
            { getByConversationId: jest.fn(() => Promise.resolve(null)) } as never,
            { findAllInOrganizationOrTenant: jest.fn(() => Promise.resolve({ items: [], total: 0 })) } as never,
            { find: jest.fn(() => Promise.resolve([])) } as never
        )

        await expect(service.listSection(conversation(), 'unknown')).rejects.toThrow(
            'translated:server-ai:Error.UnsupportedTaskSummarySection'
        )

        const page = await service.listSection(conversation(), 'outputs', 0, 500)

        expect(page.limit).toBe(50)
        expect(page.items).toHaveLength(50)
        expect(page.total).toBe(60)
        expect(page.items[0]).toMatchObject({ id: 'output-1', title: 'Newest output' })
    })
})

function conversation(): ChatConversation {
    return {
        id: 'conversation-1',
        threadId: 'thread-1',
        xpertId: 'xpert-1',
        status: 'idle',
        updatedAt: new Date('2026-07-13T06:00:00.000Z')
    } as ChatConversation
}
