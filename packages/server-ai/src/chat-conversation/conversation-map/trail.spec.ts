import type { IChatMessage, TMessageContentComponent } from '@xpert-ai/contracts'
import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { DataSource, In } from 'typeorm'
import { conversationTrail } from './trail-conversation'
import { executionTrail, type TrailRun } from './trail-execution'
import { readTrailRuns } from './trail-reader'
import { appendTrailActivity } from './trail-activity'
import { trailGraphSchema } from './trail.schema'
import { layoutTrail } from './remote-components/conversation-map/src/trail-layout'

const message = (id: string, role: 'human' | 'ai', parentId?: string): IChatMessage => ({
    id,
    role,
    parentId,
    content: id,
    status: Status.SUCCESS
})
const root: TrailRun = { id: 'root', isRoot: true, status: 'success', title: 'Main' }
const child: TrailRun = {
    id: 'child',
    parentId: 'root',
    category: 'agent',
    invocationKind: 'sub_agent',
    sourceToolCallId: 'delegate',
    title: 'Verifier',
    status: 'success',
    businessOutcome: { status: 'failed', accepted: false, subjectId: 'task' }
}
function tool(
    id: string,
    executionId: string,
    status: string
): TMessageContentComponent<{
    title: string
    status: string
    input: { password: string; query: string }
    output: string
}> {
    return {
        type: 'component',
        id,
        executionId,
        data: {
            id,
            category: 'Tool',
            title: id,
            status,
            input: { password: 'secret', query: 'safe' },
            output: 'result'
        }
    }
}
const reply = (): IChatMessage => ({
    id: 'reply',
    role: 'ai',
    executionId: 'root',
    createdInThreadId: 'original',
    status: Status.SUCCESS,
    content: [tool('delegate', 'root', 'success'), tool('check', 'child', 'running'), tool('check', 'child', 'fail')]
})

describe('conversation growth-tree projections', () => {
    it('deduplicates shared history, retains nested forks and follows the selected path', () => {
        const messages = [
            message('h', 'human'),
            message('a', 'ai', 'h'),
            message('h2', 'human', 'a'),
            message('a2', 'ai', 'h2'),
            message('s', 'human', 'a'),
            message('sa', 'ai', 's'),
            message('nested', 'ai', 's')
        ]
        const graph = conversationTrail(
            'c',
            'Topic',
            'side',
            [
                { threadId: 'main', title: 'Main', current: false, status: 'idle', headMessageId: 'a2' },
                { threadId: 'side', title: 'Side', current: true, status: 'idle', headMessageId: 'sa' },
                { threadId: 'nested', title: 'Nested', current: false, status: 'idle', headMessageId: 'nested' }
            ],
            messages
        )
        expect(graph.steps.filter((step) => step.preview === 'h')).toHaveLength(1)
        expect(graph.lanes.filter((lane) => lane.parentId)).toHaveLength(4)
        expect(graph.steps.find((step) => step.messageId === 'sa')?.threadId).toBe('side')
        expect(graph.lanes.filter((lane) => lane.primary).every((lane) => lane.threadId === 'side')).toBe(true)
        expect(trailGraphSchema.safeParse(graph).success).toBe(true)
        expect(layoutTrail(graph)).toEqual(layoutTrail(graph))
    })
    it('retains empty branches and rejects a broken or cyclic message path', () => {
        const threads = [{ threadId: 'empty', title: 'Empty', current: true, status: 'idle' }]
        expect(conversationTrail('c', '', 'empty', threads, []).lanes).toHaveLength(1)
        expect(() =>
            conversationTrail('c', '', 'empty', [{ ...threads[0], headMessageId: 'h' }], [message('h', 'human', 'h')])
        ).toThrow()
    })
    it('refreshes conversation threads using the platform busy status', () => {
        const graph = conversationTrail(
            'c',
            '',
            'main',
            [{ threadId: 'main', title: 'Main', current: true, status: 'busy' }],
            []
        )
        expect(graph.live).toBe(true)
        expect(graph.lanes[0].status).toBe('running')
    })
    it('uses the actual inherited question for the first reply after a fork', () => {
        const graph = conversationTrail(
            'c',
            '',
            'main',
            [
                { threadId: 'main', title: 'Main', current: true, status: 'idle', headMessageId: 'last' },
                { threadId: 'side', title: 'Side', current: false, status: 'idle', headMessageId: 'alternate' }
            ],
            [
                message('first-question', 'human'),
                message('reply', 'ai', 'first-question'),
                message('later-question', 'human', 'reply'),
                message('last', 'ai', 'later-question'),
                message('alternate', 'ai', 'first-question')
            ]
        )
        expect(graph.steps.find((step) => step.messageId === 'reply')?.preview).toBe('first-question')
    })
    it('refreshes running replies even before their execution root has been persisted', () => {
        const graph = executionTrail('c', 'branch', '', { ...reply(), status: Status.RUNNING }, [])
        expect(graph.live).toBe(true)
        expect(graph.coverage).toContain('no_execution')
    })
    it('keeps Agent delegation distinct from tool updates and business outcomes', () => {
        const graph = executionTrail('c', 'branch', 'Topic', reply(), [root, child])
        expect(graph.steps.filter((step) => step.toolCallId === 'check')).toHaveLength(1)
        expect(graph.steps.find((step) => step.toolCallId === 'check')).toMatchObject({
            status: 'error',
            activity: 'other',
            laneId: 'child'
        })
        expect(graph.lanes.find((lane) => lane.id === 'child')).toMatchObject({
            parentId: 'root',
            spawnStepId: 'tool:root:delegate',
            status: 'success',
            outcome: { accepted: false }
        })
        expect(JSON.stringify(graph)).not.toContain('secret')
        expect(graph.lanes.filter((lane) => lane.primary).map((lane) => lane.id)).toEqual(['root'])
        expect(graph.coverage).toContain('timing_unavailable')
    })
    it('never guesses Agent identity or activity from a name and excludes reasoning', () => {
        const data = reply()
        data.content = [
            tool('verify_test_read', 'missing', 'running'),
            { type: 'reasoning', text: 'private reasoning' }
        ]
        const graph = executionTrail('c', 'branch', '', data, [root])
        expect(graph.coverage).toContain('missing_identity')
        expect(graph.steps[0].activity).toBe('other')
        expect(JSON.stringify(graph)).not.toContain('private reasoning')
    })
    it('keeps missing execution and historical snapshots explicit', async () => {
        const db = Object.assign(Object.create(DataSource.prototype), { getRepository: jest.fn() })
        const data = { ...reply(), historical: true, historicalAgentRuns: [root, child] }
        const result = await readTrailRuns(db, { tenantId: 't', organizationId: 'o' }, data, 'branch')
        expect(db.getRepository).not.toHaveBeenCalled()
        expect(result.runs).toEqual([root, child])
        const graph = executionTrail('c', 'branch', '', data, result.runs)
        expect(graph.coverage).toContain('historical')
        expect(graph.live).toBe(false)
        expect(executionTrail('c', 'branch', '', reply(), []).coverage).toContain('no_execution')
    })
    it('scopes every descendant read to the original thread and organization', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({ ...root, threadId: 'original' }),
            find: jest
                .fn()
                .mockResolvedValueOnce([{ ...child, threadId: 'original' }])
                .mockResolvedValue([])
        }
        const db = Object.assign(Object.create(DataSource.prototype), {
            getRepository: jest.fn().mockReturnValue(repository)
        })
        await readTrailRuns(db, { tenantId: 'tenant', organizationId: 'org' }, reply(), 'descendant')
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'root', tenantId: 'tenant', organizationId: 'org', threadId: 'original' }
            })
        )
        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { parentId: In(['root']), tenantId: 'tenant', organizationId: 'org', threadId: 'original' }
            })
        )
    })
    it('uses typed external file changes, first sequence and explicit capture gaps', () => {
        const graph = executionTrail('c', 'branch', '', reply(), [root, child])
        appendTrailActivity(graph, [
            {
                id: 'external',
                parentExecutionId: 'root',
                title: 'Coding',
                status: 'success',
                activity: {
                    state: 'closed',
                    gaps: [],
                    nextCursor: 5,
                    hasMore: true,
                    items: [
                        {
                            id: 'edit',
                            seq: 5,
                            firstSeq: 1,
                            observedAt: '2026-10-31T00:00:00Z',
                            content: {
                                kind: 'tool',
                                name: 'write',
                                status: 'succeeded',
                                detail: { type: 'file_change', files: [] }
                            }
                        },
                        {
                            id: 'test',
                            seq: 3,
                            firstSeq: 2,
                            observedAt: '2026-10-31T00:00:00Z',
                            content: { kind: 'tool', activityKind: 'verify', status: 'failed' }
                        }
                    ]
                }
            }
        ])
        expect(graph.steps.slice(-2).map((step) => step.activity)).toEqual(['change', 'verify'])
        expect(graph.coverage).toContain('record_limit')
    })
    it('produces finite bounded geometry and collapses descendants without changing the main Agent', () => {
        const graph = executionTrail('c', 'branch', '', reply(), [
            root,
            child,
            { id: 'grandchild', parentId: 'child', category: 'agent', title: 'Nested' }
        ])
        const drawing = layoutTrail(graph, new Set(['child']))
        expect(drawing.tips.map((tip) => tip.lane.id)).toEqual(['root', 'child'])
        expect(JSON.stringify(drawing)).not.toMatch(/NaN|Infinity/)
        for (const mark of drawing.marks) {
            expect(mark.x).toBeGreaterThanOrEqual(0)
            expect(mark.x).toBeLessThan(drawing.width)
            expect(mark.y).toBeGreaterThanOrEqual(0)
            expect(mark.y).toBeLessThan(drawing.height)
        }
    })
})
