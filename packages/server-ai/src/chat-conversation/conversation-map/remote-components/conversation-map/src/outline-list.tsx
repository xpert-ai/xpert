import React from 'react'
import { Bot, ChevronDown, ChevronRight, UserRound } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/shadcn-ui'
import type { MapNode } from '../../../schema'
import type { Labels } from './i18n'
import type { OutlineEntry } from './layout'
import { icons, NodeMenu, NodeQuickActions, type NodeAction } from './graph'
import { NodeUpdatedAt } from './node-details'

export function OutlineList({
    entries,
    expanded,
    selected,
    query,
    labels: l,
    locale,
    pending,
    select,
    toggle,
    action
}: {
    entries: OutlineEntry[]
    expanded: Set<string>
    selected?: string
    query: string
    labels: Labels
    locale: string
    pending: boolean
    select: (node: MapNode) => void
    toggle: (node: MapNode) => void
    action: (action: NodeAction, node: MapNode) => void
}) {
    return (
        <ul className="min-w-0" aria-label={query ? l.matching : l.title}>
            {entries.map(({ node, guides }, index) => {
                const Icon = icons[node.kind]
                const open = expanded.has(node.id)
                const canExpand = node.expandable && !query
                const showAnswer =
                    node.kind === 'turn' &&
                    node.answer &&
                    (!query || !node.preview.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
                const excerpt =
                    (showAnswer ? node.answer : node.kind === 'turn' ? node.preview : node.lastHumanMessage?.text) ||
                    (node.lastHumanMessage || node.kind === 'turn' ? l.nonTextMessage : l.noHumanMessage)
                const caption = showAnswer
                    ? l.aiReply
                    : node.kind === 'turn'
                      ? l.humanMessage
                      : node.kind === 'conversation'
                        ? l.currentBranchQuestion
                        : l.lastHumanMessage
                const ContextIcon = showAnswer ? Bot : UserRound
                const inherited = node.shared || node.lastHumanMessage?.inherited
                const path = query
                    ? node.path
                          ?.slice(0, -1)
                          .map((part) => part.title)
                          .join(' / ')
                    : undefined
                return (
                    <li
                        key={node.id}
                        data-node-id={node.id}
                        style={{ paddingInlineStart: guides.length * 20 }}
                        className={`relative rounded-md py-1.5 pr-1 ${index > 0 && node.kind === 'conversation' ? 'border-t border-border/60' : ''} ${selected === node.id ? 'bg-accent' : 'hover:bg-muted/50'}`}
                    >
                        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0">
                            {guides.map((continues, column) => (
                                <span
                                    key={column}
                                    className="absolute inset-y-0 w-5"
                                    style={{ left: `calc(0.75rem + ${column * 20}px)` }}
                                >
                                    {(continues || column === guides.length - 1) && (
                                        <span
                                            className={`absolute left-0 top-0 border-l border-border ${continues ? 'h-full' : 'h-4.5'}`}
                                        />
                                    )}
                                    {column === guides.length - 1 && (
                                        <span className="absolute left-0 top-4.5 w-2 border-t border-border" />
                                    )}
                                </span>
                            ))}
                        </span>
                        <div className="flex min-w-0 items-center gap-1.5">
                            {canExpand ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label={`${open ? l.collapse : l.expand} ${node.title}`}
                                            aria-expanded={open}
                                            onClick={() => toggle(node)}
                                        >
                                            {open ? (
                                                <ChevronDown className="size-4" aria-hidden />
                                            ) : (
                                                <ChevronRight className="size-4" aria-hidden />
                                            )}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={6}>{open ? l.collapse : l.expand}</TooltipContent>
                                </Tooltip>
                            ) : (
                                <span className="size-6 shrink-0" aria-hidden />
                            )}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        role="img"
                                        tabIndex={0}
                                        aria-label={l[node.kind]}
                                        className={`flex h-6 w-5 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${node.current ? 'text-info' : 'text-muted-foreground'}`}
                                    >
                                        <Icon className="size-4" aria-hidden />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6} className="max-w-sm">
                                    <span>
                                        {l[node.kind]}
                                        {node.current ? ` · ${l.current}` : ''}
                                    </span>
                                    {node.conversationTitle && (
                                        <span className="mt-1 block">
                                            {l.conversation}: {node.conversationTitle}
                                        </span>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        className="h-6 min-w-0 flex-1 justify-start px-0 text-left text-sm font-medium"
                                        onClick={() => select(node)}
                                        onKeyDown={(event) => {
                                            if (
                                                canExpand &&
                                                ((event.key === 'ArrowRight' && !open) ||
                                                    (event.key === 'ArrowLeft' && open))
                                            ) {
                                                event.preventDefault()
                                                toggle(node)
                                            }
                                        }}
                                    >
                                        <span className="truncate">
                                            <Highlight text={node.title} query={query} />
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6} className="max-w-sm break-words">
                                    {node.title}
                                </TooltipContent>
                            </Tooltip>
                            <NodeUpdatedAt node={node} labels={l} locale={locale} compact />
                            <span className="flex shrink-0 items-center gap-1">
                                <NodeQuickActions node={node} labels={l} action={action} pending={pending} compact />
                                <NodeMenu node={node} labels={l} action={action} />
                            </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-start gap-1.5 pl-14 text-xs text-muted-foreground">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        role="img"
                                        tabIndex={0}
                                        aria-label={caption}
                                        className="mt-0.5 shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <ContextIcon className="size-3" aria-hidden />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6}>{caption}</TooltipContent>
                            </Tooltip>
                            {inherited && <span className="shrink-0">{l.inheritedQuestion} ·</span>}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        tabIndex={0}
                                        className={`min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${query ? 'line-clamp-2 break-words' : 'truncate'}`}
                                    >
                                        <Highlight text={excerpt} query={query} />
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent
                                    sideOffset={6}
                                    className="max-h-64 max-w-[min(32rem,calc(100vw_-_2rem))] overflow-auto whitespace-pre-line break-words"
                                >
                                    {caption}: {excerpt}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        {path && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <p
                                        tabIndex={0}
                                        className="mt-0.5 truncate pl-14 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {path}
                                    </p>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={6} className="max-w-sm break-words">
                                    {path}
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

function Highlight({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>
    const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
    if (index < 0) return <>{text}</>
    return (
        <>
            {text.slice(0, index)}
            <mark className="bg-accent text-accent-foreground font-medium">
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    )
}
