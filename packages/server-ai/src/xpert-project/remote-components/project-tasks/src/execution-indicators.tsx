import { executionSummary } from './execution-summary'
import { useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent, cn } from '@xpert-ai/shadcn-ui'
import { CodingToolIcon } from '../../../../shared/coding-tools/coding-tool-icon'
import { executionProviderLabel } from './execution-provider'
import { type Attempt, attemptTimes } from './model'
import { type Texts, dateTime } from './i18n'
import { openTaskExecution } from './execution-navigation'

/** Callers supply only the attempts belonging to this node or lane. */
export function ExecutionIndicators({
    title,
    attempts,
    t,
    locale,
    onError,
    className,
    taskTitles
}: {
    title: string
    attempts: Attempt[]
    t: Texts
    locale: string
    onError: (message: string) => void
    className?: string
    taskTitles?: ReadonlyMap<string, string>
}) {
    const [busy, setBusy] = useState<string | null>(null)
    const open = async (attempt: Attempt) => {
        setBusy(attempt.id)
        try {
            await openTaskExecution(attempt.id, t.openFailed)
        } catch (error) {
            onError(error instanceof Error ? error.message : t.error)
        } finally {
            setBusy(null)
        }
    }
    if (!attempts.length) return null
    return (
        <div className={cn('flex min-w-0 items-center', className)}>
            {!!attempts.length && (
                <div
                    className="flex min-w-6 max-w-full items-center overflow-x-auto"
                    aria-label={`${title} · ${t.history}`}
                >
                    {[...attempts]
                        .sort((a, b) => a.attempt - b.attempt)
                        .map((attempt) => {
                            const { state, color, businessResult, label: statusLabel } = executionSummary(attempt, t)
                            const canOpen = !!(attempt.invocationId || attempt.agentExecutionId)
                            const { start, end } = attemptTimes(attempt)
                            const label = `${taskTitles?.get(attempt.taskId) ?? title} · ${t.attempt} ${attempt.attempt} ${t.execution} · ${statusLabel}${businessResult ? ` · ${t.outcome}: ${businessResult}` : ''}`
                            return (
                                <Tooltip key={attempt.id}>
                                    <TooltipTrigger
                                        aria-label={label}
                                        aria-disabled={!canOpen || !!busy}
                                        aria-busy={busy === attempt.id}
                                        className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted focus-visible:outline-ring aria-disabled:opacity-50"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            if (canOpen && !busy) void open(attempt)
                                        }}
                                    >
                                        <span
                                            className={cn(
                                                'size-2 rounded-full',
                                                color,
                                                (state === 'running' || busy === attempt.id) &&
                                                    'motion-safe:animate-pulse'
                                            )}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {attempt.runtimeProvider && (
                                            <p className="flex items-center gap-1.5">
                                                <CodingToolIcon
                                                    toolId={attempt.runtimeToolId}
                                                    provider={attempt.runtimeProvider}
                                                    decorative
                                                />
                                                {executionProviderLabel(attempt)}
                                            </p>
                                        )}
                                        {attempt.executorName && <p>{attempt.executorName}</p>}
                                        <p>{label}</p>
                                        <p>
                                            {dateTime(start, locale)} → {dateTime(end, locale)}
                                        </p>
                                        {attempt.error && <p className="max-w-64 break-words">{attempt.error}</p>}
                                        <p>{canOpen ? t.open : t.unavailable}</p>
                                    </TooltipContent>
                                </Tooltip>
                            )
                        })}
                </div>
            )}
        </div>
    )
}
