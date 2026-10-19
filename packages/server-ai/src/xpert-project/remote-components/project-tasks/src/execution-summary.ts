import { attemptTimes, isRunning, type Attempt } from './model'
import { runtimeLabel, type Texts } from './i18n'
export function executionSummary(attempt: Attempt, t: Texts) {
    const state = attempt.runtimeStatus ?? attempt.invocationStatus ?? attempt.status
    const succeeded = state === 'success' || state === 'succeeded'
    const failed =
        attempt.status === 'failed' ||
        attempt.status === 'error' ||
        attempt.outputSummary === 'rejected' ||
        ['failed', 'error', 'timeout'].includes(state)
    const businessResult =
        attempt.outputSummary === 'rejected' ? t.rejected : attempt.status === 'failed' && succeeded ? t.failed : null
    return { state, succeeded, failed, businessResult, label: runtimeLabel(state, t) }
}
export function executionDuration(attempt: Attempt, now: number): number | null {
    const { start, end } = attemptTimes(attempt)
    const from = start ? Date.parse(start) : NaN
    const to = end ? Date.parse(end) : isRunning(attempt) ? now : NaN
    return Number.isFinite(from) && Number.isFinite(to) && to >= from ? to - from : null
}
export function formatExecutionDuration(ms: number | null, locale: string): string {
    if (ms === null) return '—'
    const seconds = Math.floor(ms / 1000),
        hours = Math.floor(seconds / 3600),
        minutes = Math.floor(seconds / 60) % 60
    const zh = locale.startsWith('zh')
    return [
        hours ? `${hours}${zh ? '小时' : 'h'}` : '',
        minutes ? `${minutes}${zh ? '分' : 'm'}` : '',
        `${seconds % 60}${zh ? '秒' : 's'}`
    ]
        .filter(Boolean)
        .join(' ')
}
