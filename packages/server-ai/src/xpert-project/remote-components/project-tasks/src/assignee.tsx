import { executionProviderLabel } from './execution-provider'
import { useState } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@xpert-ai/shadcn-ui'
import type { Node } from './bridge'
import { type Attempt, owner } from './model'
import { type Texts } from './i18n'
import { ExecutionIndicators } from './execution-indicators'

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
    onError,
    className,
    taskTitles,
    laneHeading,
    laneSelected,
    onLane
}: {
    task: Node
    attempts: Attempt[]
    t: Texts
    locale: string
    onError: (message: string) => void
    className?: string
    taskTitles?: ReadonlyMap<string, string>
    laneHeading?: string
    laneSelected?: boolean
    onLane?: () => void
}) {
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const runtime = [...attempts]
        .sort((a, b) => b.attempt - a.attempt)
        .find((attempt) => attempt.invocationId && attempt.runtimeProvider)
    const fallback = runtime
        ? (executionProviderLabel(runtime) ?? t.unassigned)
        : attempts.some((attempt) => attempt.runtimeProvider === 'pipeline-service')
          ? t.serviceExecutor
          : t.unassigned
    const name = owner(task, fallback, t.unnamedAssistant)
    const avatar = task.assigneeAvatar
    const emoji = avatarEmoji(avatar?.emoji?.unified)
    return (
        <div
            className={cn(
                'flex min-w-0 items-center gap-1.5 overflow-hidden px-3 text-xs text-muted-foreground',
                laneHeading && 'flex-wrap gap-3 px-0',
                className
            )}
        >
            {task.assigneeXpertId && (
                <span
                    aria-hidden
                    className={cn(
                        'flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm',
                        laneHeading && 'size-12 rounded-xl border text-2xl shadow-sm'
                    )}
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
            {laneHeading ? (
                <div className="min-w-0 flex-1">
                    <button
                        onClick={onLane}
                        aria-pressed={laneSelected}
                        className="mb-2 flex max-w-full items-center gap-2 rounded-sm text-left text-base font-semibold text-foreground focus-visible:outline-ring"
                    >
                        <span className="truncate text-base font-semibold" title={laneHeading}>
                            {laneHeading}
                        </span>
                        <Bot className="size-3.5 shrink-0" />
                    </button>
                    <button
                        onClick={onLane}
                        className="line-clamp-2 w-full break-words rounded-sm text-left text-sm underline decoration-muted-foreground/50 underline-offset-4 focus-visible:outline-ring"
                        title={name}
                    >
                        <span className="text-sm">{name}</span>
                    </button>
                </div>
            ) : (
                <span className="min-w-8 truncate" title={name}>
                    {name}
                </span>
            )}
            <ExecutionIndicators
                title={task.title}
                attempts={attempts}
                t={t}
                locale={locale}
                onError={onError}
                taskTitles={taskTitles}
                className={laneHeading ? 'basis-full justify-end' : 'max-w-[50%] shrink-0'}
            />
        </div>
    )
}
