import { CodingToolIcon } from '../../../../shared/coding-tools/coding-tool-icon'
import { codingToolBrand } from '../../../../shared/coding-tools/branding'
import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, cn } from '@xpert-ai/shadcn-ui'
import type { Node } from './bridge'
import { type Attempt, attemptTimes, owner } from './model'
import { type Texts, dateTime, runtimeLabel } from './i18n'
import { openTaskExecution } from './execution-navigation'

function avatarEmoji(unified: string | undefined) {
    if (!unified || !/^[\da-f]+(?:-[\da-f]+)*$/i.test(unified)) return null
    const points = unified.split('-').map((part) => parseInt(part, 16))
    return points.every((point) => point <= 0x10ffff) ? String.fromCodePoint(...points) : null
}

/** Names, avatars and attempts all come from the generic project graph. */
export function Assignee({
    task,
    attempts,
    t,
    locale,
    onError
}: {
    task: Node
    attempts: Attempt[]
    t: Texts
    locale: string
    onError: (message: string) => void
}) {
    const [busy, setBusy] = useState<string | null>(null)
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const name = owner(task, t.unassigned, t.unnamedAssistant)
    const avatar = task.assigneeAvatar
    const emoji = avatarEmoji(avatar?.emoji?.unified)
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
    return (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-3 text-xs text-muted-foreground">
            {task.assigneeXpertId && (
                <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm"
                    style={{ backgroundColor: avatar?.background }}
                >
                    {avatar?.url && failedUrl !== avatar.url ? (
                        <img
                            src={avatar.url}
                            alt=""
                            className="size-full object-cover"
                            onError={() => setFailedUrl(avatar.url ?? null)}
                        />
                    ) : (
                        emoji || <Bot className="size-3.5" />
                    )}
                </span>
            )}
            <span className="min-w-8 truncate" title={name}>
                {name}
            </span>
            {!!attempts.length && (
                <div
                    className="flex min-w-6 max-w-[50%] shrink-0 items-center overflow-x-auto"
                    aria-label={`${task.title} · ${t.history}`}
                >
                    {[...attempts]
                        .sort((a, b) => a.attempt - b.attempt)
                        .map((attempt) => {
                            const state = attempt.runtimeStatus ?? attempt.status
                            const canOpen = !!(attempt.invocationId || attempt.agentExecutionId)
                            const succeeded = state === 'success' || state === 'succeeded'
                            const failed =
                                attempt.status === 'failed' ||
                                attempt.status === 'error' ||
                                attempt.outputSummary === 'rejected' ||
                                ['failed', 'error', 'timeout'].includes(state)
                            const color = failed
                                ? 'bg-destructive'
                                : succeeded
                                  ? 'bg-[var(--success)]'
                                  : state === 'running'
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground'
                            const { start, end } = attemptTimes(attempt)
                            const businessResult =
                                attempt.outputSummary === 'rejected'
                                    ? t.rejected
                                    : attempt.status === 'failed' && succeeded
                                      ? t.failed
                                      : null
                            const label = `${task.title} · ${t.attempt} ${attempt.attempt} ${t.execution} · ${runtimeLabel(state, t)}${businessResult ? ` · ${t.outcome}: ${businessResult}` : ''}`
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
                                                {codingToolBrand({
                                                    toolId: attempt.runtimeToolId,
                                                    provider: attempt.runtimeProvider
                                                })?.name ?? attempt.runtimeProvider}
                                            </p>
                                        )}
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
