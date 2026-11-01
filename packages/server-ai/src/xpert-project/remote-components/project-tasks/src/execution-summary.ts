import { attemptTimes, isRunning, type Attempt } from './model'
import { runtimeLabel, type Texts } from './i18n'
export function executionSummary(attempt: Attempt, t: Texts) {
    // Execution color follows the runtime result; business acceptance is a separate annotation.
    const state = attempt.invocationStatus ?? attempt.runtimeStatus ?? attempt.status
    const succeeded = state === 'success' || state === 'succeeded'
    const failed = ['failed', 'error', 'timeout'].includes(state)
    const businessResult =
        attempt.outputSummary === 'rejected' ? t.rejected : attempt.status === 'failed' && succeeded ? t.failed : null
    const color = failed
        ? 'bg-destructive'
        : succeeded
          ? 'bg-[var(--success)]'
          : state === 'running'
            ? 'bg-primary'
            : 'bg-muted-foreground'
    return { state, succeeded, failed, businessResult, color, label: runtimeLabel(state, t) }
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
