import { XpertAgentExecutionStatusEnum as Status } from '@xpert-ai/contracts'
import { projectTaskRuntimeTiming } from './project-task-runtime-timing'

const start = new Date('2026-10-07T12:00:00Z')
const completedAt = new Date('2026-10-07T14:05:00Z')
const run = { status: Status.SUCCESS, createdAt: start, completedAt, updatedAt: start, elapsedTime: 300000 }

describe('project task runtime timing', () => {
    it('uses the recorded wall-clock end after a long pause and a five-minute resumed segment', () => {
        expect(projectTaskRuntimeTiming(run)).toEqual({
            runtimeStatus: 'success',
            runtimeStartedAt: start.toISOString(),
            runtimeCompletedAt: completedAt.toISOString()
        })
    })
    it('does not move the end when metadata or execution duration changes', () => {
        const updated = { ...run, updatedAt: new Date('2026-10-08T00:00:00Z'), elapsedTime: 900000 }
        expect(projectTaskRuntimeTiming(updated).runtimeCompletedAt).toBe(completedAt.toISOString())
    })
    it.each([Status.ERROR, Status.TIMEOUT, Status.INTERRUPTED])(
        'retains the recorded end of %s executions',
        (status) => {
            expect(projectTaskRuntimeTiming({ ...run, status }).runtimeCompletedAt).toBe(completedAt.toISOString())
        }
    )
    it.each([Status.RUNNING, Status.PENDING])('does not show a stale end while %s', (status) => {
        expect(projectTaskRuntimeTiming({ ...run, status }).runtimeCompletedAt).toBeNull()
    })
    it('leaves legacy completion unknown even when elapsed time and a later updatedAt exist', () => {
        const legacy = { ...run, completedAt: null, updatedAt: completedAt }
        expect(projectTaskRuntimeTiming(legacy).runtimeCompletedAt).toBeNull()
    })
    it('preserves recorded zero-duration executions and missing runtime records', () => {
        expect(projectTaskRuntimeTiming({ ...run, completedAt: start }).runtimeCompletedAt).toBe(start.toISOString())
        expect(projectTaskRuntimeTiming()).toEqual({
            runtimeStatus: 'unknown',
            runtimeStartedAt: null,
            runtimeCompletedAt: null
        })
    })
    it('does not expose invalid dates or an end preceding the start', () => {
        expect(projectTaskRuntimeTiming({ ...run, completedAt: new Date('invalid') }).runtimeCompletedAt).toBeNull()
        expect(projectTaskRuntimeTiming({ ...run, completedAt: new Date(0) }).runtimeCompletedAt).toBeNull()
        expect(projectTaskRuntimeTiming({ ...run, createdAt: new Date('invalid') }).runtimeStartedAt).toBeNull()
    })
})
