import { forecastProjectTasks, validateProjectTaskGraph, type ProjectTaskNode } from '@xpert-ai/contracts'
import { assertOrdinaryTask, assertOrdinaryTaskInput } from './project-task-ownership'

const node = (id: string, patch: Partial<ProjectTaskNode> = {}): ProjectTaskNode => ({
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

describe('project task graph invariants', () => {
    it('separates dynamically delegated children from dependencies', () => {
        expect(() =>
            validateProjectTaskGraph([node('writing'), node('figure', { parentTaskId: 'writing' })])
        ).not.toThrow()
    })
    it('rejects missing cross-project references, containment loops and dependency loops', () => {
        expect(() => validateProjectTaskGraph([node('a', { predecessorIds: ['foreign'] })])).toThrow('NOT_FOUND')
        expect(() =>
            validateProjectTaskGraph([node('a', { parentTaskId: 'b' }), node('b', { parentTaskId: 'a' })])
        ).toThrow('TREE_CYCLE')
        expect(() =>
            validateProjectTaskGraph([node('a', { predecessorIds: ['b'] }), node('b', { predecessorIds: ['a'] })])
        ).toThrow('DEPENDENCY_CYCLE')
    })
    it('propagates delays to successors and preserves unknown estimates', () => {
        const tasks = [
            node('a', { plannedStartAt: '2026-09-29T08:00:00Z', estimatedDurationMs: 3600000 }),
            node('b', { predecessorIds: ['a'], estimatedDurationMs: 7200000 }),
            node('c', { predecessorIds: ['b'] })
        ]
        const forecast = forecastProjectTasks(tasks, 'a')
        expect(forecast[1]).toMatchObject({
            startAt: '2026-09-29T09:00:00.000Z',
            endAt: '2026-09-29T11:00:00.000Z',
            affected: true
        })
        expect(forecast[2]).toMatchObject({ endAt: null, affected: true, critical: false })
    })

    it('rolls summary dates up from children without adding another duration', () => {
        const forecast = forecastProjectTasks([
            node('group', { kind: 'summary' }),
            node('a', { parentTaskId: 'group', plannedStartAt: '2026-09-29T08:00:00Z', estimatedDurationMs: 3600000 }),
            node('b', { parentTaskId: 'group', predecessorIds: ['a'], estimatedDurationMs: 3600000 })
        ])
        expect(forecast[0]).toMatchObject({
            startAt: '2026-09-29T08:00:00.000Z',
            endAt: '2026-09-29T10:00:00.000Z',
            critical: false
        })
        expect(forecast.slice(1).every((row) => row.critical)).toBe(true)
    })
    it('uses observed completion times and does not forecast through an unresolved blocker', () => {
        const tasks = [
            node('a', {
                plannedStartAt: '2026-09-29T08:00:00Z',
                estimatedDurationMs: 3600000,
                status: 'done',
                actualStartAt: '2026-09-29T08:00:00Z',
                actualEndAt: '2026-09-29T10:00:00Z'
            }),
            node('b', { predecessorIds: ['a'], estimatedDurationMs: 3600000, status: 'blocked' }),
            node('c', { predecessorIds: ['b'], estimatedDurationMs: 3600000 })
        ]
        expect(forecastProjectTasks(tasks, 'b')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    taskId: 'b',
                    startAt: '2026-09-29T10:00:00.000Z',
                    endAt: null,
                    affected: true
                }),
                expect.objectContaining({ taskId: 'c', endAt: null, affected: true, critical: false })
            ])
        )
    })
    it('applies a summary dependency to its children and includes the upstream critical path', () => {
        const forecast = forecastProjectTasks(
            [
                node('read', { plannedStartAt: '2026-09-29T08:00:00Z', estimatedDurationMs: 3600000 }),
                node('group', { kind: 'summary', predecessorIds: ['read'] }),
                node('chapter', { parentTaskId: 'group', estimatedDurationMs: 3600000 }),
                node('review', { predecessorIds: ['group'], estimatedDurationMs: 3600000 })
            ],
            'read'
        )
        expect(forecast.find((item) => item.taskId === 'chapter')).toMatchObject({
            startAt: '2026-09-29T09:00:00.000Z',
            affected: true,
            critical: true
        })
        expect(forecast.find((item) => item.taskId === 'read')?.critical).toBe(true)
        expect(forecast.find((item) => item.taskId === 'group')?.critical).toBe(false)
        expect(forecast.find((item) => item.taskId === 'review')?.endAt).toBe('2026-09-29T11:00:00.000Z')
    })
    it('does not let ordinary tools overwrite provider state or fabricate provider identity', () => {
        expect(() => assertOrdinaryTask({ providerKey: 'bid.tasks' })).toThrow()
        expect(() => assertOrdinaryTaskInput({ providerKey: null })).toThrow()
        expect(() => assertOrdinaryTaskInput({ predecessorIds: ['a'] })).toThrow()
        expect(() => assertOrdinaryTask({ providerKey: null })).not.toThrow()
    })
})
