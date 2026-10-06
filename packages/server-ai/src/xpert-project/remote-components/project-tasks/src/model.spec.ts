import type { Node } from './bridge'
import { attemptTimes, buildRows, filteredTasks, initialFilters, isRunning, timelineDomain } from './model'

const task = (id: string, patch: Partial<Node> = {}): Node => ({
    id,
    title: id,
    status: 'todo',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: null,
    plannedEndAt: null,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: null,
    ...patch
})
describe('generic project task views', () => {
    const tasks = [
        task('parent', { kind: 'summary', status: 'done' }),
        task('child', { title: 'FAQ', parentTaskId: 'parent', status: 'in_progress', assigneeXpertId: 'writer' }),
        task('other', { status: 'blocked' })
    ]
    it('retains ancestors of search matches and reveals children under collapsed parents', () => {
        const rows = buildRows(tasks, { ...initialFilters, search: 'faq' }, 'hierarchy', new Set(['parent']), 'source')
        expect(rows).toEqual([
            expect.objectContaining({ task: tasks[0], contextOnly: true }),
            expect.objectContaining({ task: tasks[1], depth: 1, contextOnly: false })
        ])
        expect(buildRows(tasks, initialFilters, 'hierarchy', new Set(['parent']), 'source')).toHaveLength(2)
    })
    it('combines status, owner, type and search filters without inferring business categories', () => {
        expect(
            filteredTasks(
                tasks,
                { search: 'FAQ', statuses: ['in_progress'], assignee: 'writer', kind: 'task' },
                'source'
            )
        ).toEqual([tasks[1]])
        expect(
            buildRows(
                [task('bid-outline-task', { title: '工程目录', kind: 'milestone' })],
                initialFilters,
                'kind',
                new Set(),
                'source'
            )[0]
        ).toMatchObject({ type: 'group', value: 'milestone' })
    })
    it('keeps unassigned tasks and groups only by explicit assistant identity', () => {
        const rows = buildRows(tasks, initialFilters, 'assignee', new Set(), 'source')
        expect(rows.filter((row) => row.type === 'group')).toEqual([
            expect.objectContaining({ value: 'unassigned', count: 2 }),
            expect.objectContaining({ value: 'writer', count: 1 })
        ])
    })
    it('keeps orphan tasks visible during partial provider refresh', () => {
        expect(
            buildRows([task('orphan', { parentTaskId: 'missing' })], initialFilters, 'hierarchy', new Set(), 'source')
        ).toHaveLength(1)
    })
    it('uses actual runtime timestamps, never lease timestamps, for linked attempts', () => {
        const attempt = {
            id: 'attempt',
            taskId: 'child',
            attempt: 1,
            status: 'running',
            agentExecutionId: 'run',
            startedAt: '2026-09-29T00:00:00Z',
            runtimeStatus: 'success',
            runtimeStartedAt: '2026-09-29T01:00:00Z',
            runtimeCompletedAt: '2026-09-29T01:10:00Z'
        }
        expect(attemptTimes(attempt)).toEqual({ start: attempt.runtimeStartedAt, end: attempt.runtimeCompletedAt })
        expect(isRunning(attempt)).toBe(false)
        expect(attemptTimes({ ...attempt, runtimeStartedAt: null }).start).toBeNull()
    })
    it('bounds long timelines and ignores invalid dates without inventing task dates', () => {
        const domain = timelineDomain(['2020-01-01T00:00:00Z', '2030-01-01T00:00:00Z', 'invalid'], 'hour', Date.now())
        expect(domain.ticks).toBeLessThanOrEqual(122)
        expect(domain.start).toBeLessThanOrEqual(Date.parse('2020-01-01T00:00:00Z'))
        expect(domain.end).toBeGreaterThan(Date.parse('2030-01-01T00:00:00Z'))
        expect(timelineDomain([], 'hour', 0).ticks).toBeGreaterThanOrEqual(6)
    })
    it('uses Invocation status and actual timestamps for delegated attempts', () => {
        const attempt = {
            id: 'attempt',
            taskId: 'child',
            attempt: 1,
            invocationId: 'invocation',
            invocationStatus: 'succeeded' as const,
            status: 'running',
            startedAt: '2026-10-06T01:00:00Z',
            runtimeStartedAt: null,
            runtimeCompletedAt: '2026-10-06T01:10:00Z'
        }
        expect(attemptTimes(attempt)).toEqual({ start: null, end: attempt.runtimeCompletedAt })
        expect(isRunning(attempt)).toBe(false)
        expect(isRunning({ ...attempt, invocationStatus: 'running' })).toBe(true)
        expect(isRunning({ ...attempt, invocationStatus: 'waiting' })).toBe(false)
    })
})
