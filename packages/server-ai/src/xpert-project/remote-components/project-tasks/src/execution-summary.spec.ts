import { executionDuration, executionSummary, formatExecutionDuration } from './execution-summary'
import { texts } from './i18n'
import type { Attempt } from './model'
const start = '2026-10-19T10:00:00Z',
    end = '2026-10-19T10:01:16Z'
const attempt: Attempt = {
    id: 'execution',
    taskId: 'task',
    attempt: 1,
    status: 'succeeded',
    runtimeStatus: 'succeeded',
    runtimeStartedAt: start,
    runtimeCompletedAt: end
}
it('uses observed runtime times, not the projection registration time', () => {
    expect(executionDuration({ ...attempt, startedAt: '2026-10-18T00:00:00Z' }, Date.now())).toBe(76000)
    expect(formatExecutionDuration(76000, 'zh-Hans')).toBe('1分 16秒')
})
it('does not invent a duration for missing, invalid or terminal-without-end times', () => {
    for (const changes of [
        { runtimeStartedAt: null },
        { runtimeCompletedAt: null },
        { runtimeCompletedAt: 'invalid' },
        { runtimeCompletedAt: '2026-10-18T00:00:00Z' }
    ]) {
        expect(executionDuration({ ...attempt, ...changes }, Date.now())).toBeNull()
    }
})
it('measures running attempts against the supplied observation or historical snapshot', () => {
    expect(executionDuration({ ...attempt, runtimeStatus: 'running', runtimeCompletedAt: null }, Date.parse(end))).toBe(
        76000
    )
    expect(executionDuration({ ...attempt, runtimeStatus: 'running', runtimeCompletedAt: null }, NaN)).toBeNull()
})
it('keeps runtime success distinct from a rejected business result', () => {
    expect(executionSummary({ ...attempt, outputSummary: 'rejected' }, texts('zh-Hans'))).toMatchObject({
        succeeded: true,
        failed: false,
        businessResult: texts('zh-Hans').rejected
    })
})

it('prefers full Invocation status over stale native or Task state', () => {
    expect(
        executionSummary(
            { ...attempt, invocationStatus: 'succeeded', runtimeStatus: 'running', status: 'failed' },
            texts('zh-Hans')
        )
    ).toMatchObject({
        state: 'succeeded',
        succeeded: true,
        failed: false,
        businessResult: texts('zh-Hans').failed
    })
    expect(executionSummary({ ...attempt, invocationStatus: 'waiting' }, texts('zh-Hans'))).toMatchObject({
        state: 'waiting',
        succeeded: false,
        failed: false
    })
    expect(executionSummary({ ...attempt, runtimeStatus: 'error' }, texts('zh-Hans'))).toMatchObject({
        failed: true,
        succeeded: false
    })
})
