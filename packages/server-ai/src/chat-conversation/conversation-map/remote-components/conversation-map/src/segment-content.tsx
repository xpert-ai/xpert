import React, { useState } from 'react'
import { ArrowUpRight, MoreHorizontal } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@xpert-ai/shadcn-ui'
import type { MapNode } from '../../../schema'
import type { Labels } from './i18n'
import type { NodeAction } from './graph'
import { ChoiceSelect } from './view-controls'
import { segmentConversationTarget } from './tree-mode'

export function SegmentContent({
    node,
    labels: l,
    pending,
    action
}: {
    node: MapNode
    labels: Labels
    pending: boolean
    action: (kind: NodeAction, node: MapNode) => void
}) {
    const [chosenThread, setChosenThread] = useState<string>()
    const threads = node.segmentThreads ?? []
    const thread =
        threads.find((item) => item.threadId === chosenThread) ?? threads.find((item) => item.current) ?? threads[0]
    if (!thread) return null
    const target = segmentConversationTarget(node, thread.threadId)
    const threadTarget: MapNode = { ...target, kind: 'thread', title: thread.title, messageId: undefined }
    return (
        <div className="nodrag px-3 pb-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">
                    {node.messageCount ?? 0} {l.messageCount}
                </span>
                {threads.length > 1 ? (
                    <ChoiceSelect
                        label={l.branchContext}
                        className="h-8 min-w-0 flex-1 text-xs"
                        value={thread.threadId}
                        onChange={setChosenThread}
                        choices={threads.map((item) => ({
                            value: item.threadId,
                            label: `${item.title}${item.current ? ` · ${l.current}` : ''}`
                        }))}
                    />
                ) : (
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" disabled={pending} aria-label={l.actions}>
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => action('rename', threadTarget)}>{l.rename}</DropdownMenuItem>
                        <DropdownMenuItem disabled={pending} onSelect={() => action('side-chat', threadTarget)}>
                            {l.side}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => action('copy', target)}>{l.copy}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {node.messageCount ? (
                <div className="space-y-2 text-sm">
                    <div>
                        <p className="mb-1 text-xs text-muted-foreground">{l.lastHumanMessage}</p>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {node.lastHumanMessage?.text || l.noHumanMessage}
                        </p>
                    </div>
                    <div>
                        <p className="mb-1 text-xs text-muted-foreground">{l.aiReply}</p>
                        <p className="line-clamp-3 break-words text-muted-foreground [overflow-wrap:anywhere]">
                            {node.answer || l.noReply}
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">{l.emptyBranch}</p>
            )}
            <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-auto px-0 py-1"
                disabled={pending}
                onClick={() => action('locate', target)}
            >
                <ArrowUpRight className="size-3.5" />
                {l.openConversation}
            </Button>
        </div>
    )
}
