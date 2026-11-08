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
                            const taskTitle = taskTitles?.get(attempt.taskId) ?? title
                            const executionLabel = `${t.attempt} ${attempt.attempt} ${t.execution} · ${statusLabel}${businessResult ? ` · ${t.outcome}: ${businessResult}` : ''}`
                            return (
                                <Tooltip key={attempt.id}>
                                    <TooltipTrigger
                                        aria-label={`${taskTitle} · ${executionLabel}`}
                                        aria-disabled={!canOpen || !!busy}
                                        aria-busy={busy === attempt.id}
                                        title=""
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
                                    <TooltipContent
                                        className="block max-w-[min(22rem,calc(100vw-1rem))] py-2"
                                        sideOffset={6}
                                        collisionPadding={8}
                                    >
                                        <div className="space-y-1.5 wrap-anywhere">
                                            <p className="font-medium">{taskTitle}</p>
                                            {(attempt.runtimeProvider || attempt.executorName) && (
                                                <div className="flex flex-wrap items-start gap-x-3 gap-y-1 opacity-80">
                                                    {attempt.runtimeProvider && (
                                                        <span className="flex min-w-0 items-center gap-1.5">
                                                            <CodingToolIcon
                                                                toolId={attempt.runtimeToolId}
                                                                provider={attempt.runtimeProvider}
                                                                className="size-4 shrink-0"
                                                                decorative
                                                            />
                                                            {executionProviderLabel(attempt)}
                                                        </span>
                                                    )}
                                                    {attempt.executorName && <span>{attempt.executorName}</span>}
                                                </div>
                                            )}
                                            <p>{executionLabel}</p>
                                            <p className="flex flex-wrap gap-x-1 tabular-nums opacity-80">
                                                <span className="whitespace-nowrap">{dateTime(start, locale)} →</span>
                                                <span className="whitespace-nowrap">{dateTime(end, locale)}</span>
                                            </p>
                                            {attempt.error && (
                                                <p className="line-clamp-3 whitespace-pre-line">{attempt.error}</p>
                                            )}
                                            <p className="border-t border-background/20 pt-1.5 opacity-80">
                                                {canOpen ? t.open : t.unavailable}
                                            </p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            )
                        })}
                </div>
            )}
        </div>
    )
}
