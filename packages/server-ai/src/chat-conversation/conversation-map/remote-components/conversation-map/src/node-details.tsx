import React from 'react'
import { Clock3, MessageSquare, MessagesSquare } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/shadcn-ui'
import type { MapNode, MapPage } from '../../../schema'
import { formatLocale, type Labels } from './i18n'

export function NodeUpdatedAt({
    node,
    labels: l,
    locale,
    compact = false
}: {
    node: MapNode
    labels: Labels
    locale: string
    compact?: boolean
}) {
    if (!node.updatedAt) return null
    const date = new Date(node.updatedAt)
    const language = formatLocale(locale)
    const short = new Intl.DateTimeFormat(language, {
        year: compact ? undefined : 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date)
    const full = new Intl.DateTimeFormat(language, {
        dateStyle: 'full',
        timeStyle: 'long'
    }).format(date)
    if (compact)
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <time
                        tabIndex={0}
                        dateTime={node.updatedAt}
                        className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm text-xs tabular-nums text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Clock3 className="size-3" aria-hidden />
                        <span className="sr-only">{l.updatedAt} </span>
                        <span className="hidden sm:inline">{short}</span>
                        <span className="sr-only sm:hidden">{full}</span>
                    </time>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>
                    {l.updatedAt} {full}
                </TooltipContent>
            </Tooltip>
        )
    return (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3 shrink-0" aria-hidden />
            <time className="truncate" dateTime={node.updatedAt} title={full}>
                {l.updatedAt} {short}
            </time>
        </span>
    )
}

/** Glanceable card content; no duplicated title as a fake summary. */
export function NodeDetails({
    node,
    labels: l,
    compact = false
}: {
    node: MapNode
    labels: Labels
    compact?: boolean
}) {
    const counted = node.kind === 'conversation' && node.messageCount !== undefined
    const text = counted
        ? `${node.messageCount} ${l.messageCount}`
        : node.kind === 'turn' || node.kind === 'message'
          ? node.preview
          : node.lastHumanMessage?.text
    return (
        <span className="flex min-w-0 flex-col gap-2">
            <MessageMetadata node={node} labels={l} />
            {node.conversationTitle && node.kind !== 'conversation' && (
                <span className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                    <MessagesSquare className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span className={compact ? 'truncate' : 'line-clamp-2 break-words'}>
                        {l.conversation}: {node.conversationTitle}
                    </span>
                </span>
            )}
            {node.kind !== 'project' && (
                <span className="block min-w-0">
                    {!compact && (
                        <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="size-3 shrink-0" aria-hidden />
                            {counted
                                ? l.loadedMessages
                                : node.kind === 'message'
                                  ? messageCaption(node, l)
                                  : node.kind === 'turn'
                                    ? l.humanMessage
                                    : node.kind === 'conversation'
                                      ? l.currentBranchQuestion
                                      : l.lastHumanMessage}
                            {node.lastHumanMessage?.inherited && <span>· {l.inheritedQuestion}</span>}
                        </span>
                    )}
                    <span
                        className={`break-words text-sm ${compact ? 'line-clamp-1' : 'line-clamp-3'} ${text ? '' : 'text-muted-foreground'}`}
                    >
                        {text ||
                            (node.lastHumanMessage || node.kind === 'turn' || node.kind === 'message'
                                ? l.nonTextMessage
                                : l.noHumanMessage)}
                    </span>
                </span>
            )}
        </span>
    )
}

export function messageCaption(node: MapNode, l: Labels): string {
    return !node.message
        ? l.message
        : node.message.intent === 'reply'
          ? node.message.replyStage === 'progress'
              ? l.progressReply
              : l.finalReply
          : node.message.intent === 'request'
            ? l.requestIntent
            : l.messageIntent
}

/** Structured message semantics shared by cards, outlines and the detail panel. */
export function MessageMetadata({
    node,
    labels: l,
    participants
}: {
    node: MapNode
    labels: Labels
    participants?: MapPage['participants']
}) {
    if (!node.message) return null
    return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>
                {messageCaption(node, l)} · #{node.message.sequence}
            </span>
            {node.message.contentKinds.map((kind) => (
                <span className="rounded bg-muted px-1.5 py-0.5" key={kind}>
                    {l[kind]}
                </span>
            ))}
            {participants && !!node.message.recipientIds.length && (
                <span>
                    {l.recipients}:{' '}
                    {node.message.recipientIds
                        .map((id) => participants.find((member) => member.id === id)?.name ?? id)
                        .join('、')}
                </span>
            )}
        </span>
    )
}
