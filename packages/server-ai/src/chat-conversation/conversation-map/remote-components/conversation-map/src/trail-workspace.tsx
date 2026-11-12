import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, PanelRight, RefreshCw } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import {
    trailGraphSchema,
    type TrailGraph,
    type TrailStep
} from '../../../../../../../contracts/src/ai/conversation-trail.model'
import type { MapNode } from '../../../schema'
import { request, readOptions, type Prefs } from './bridge'
import { ChoiceSelect, HistoryToggle } from './view-controls'
import { SearchSelect } from './search-select'
import type { OptionCache } from './option-cache'
import { labels } from './i18n'
import { trailLabels } from './trail-i18n'
import { TrailTree } from './trail-tree'
import { TrailInspector } from './trail-inspector'

export function TrailWorkspace({
    projectId,
    optionCache,
    conversations,
    currentConversationId,
    prefs,
    update,
    revision,
    locale,
    locate
}: {
    projectId?: string | null
    optionCache: OptionCache
    conversations: MapNode[]
    currentConversationId?: string | null
    prefs: Prefs
    update: (patch: Partial<Prefs>) => void
    revision: number
    locale: string
    locate: (node: MapNode) => void
}) {
    const l = trailLabels(locale),
        common = labels(locale)
    const conversationId =
        prefs.trailConversationId ??
        (conversations.some((node) => node.conversationId === currentConversationId)
            ? currentConversationId
            : undefined) ??
        conversations[0]?.conversationId
    const [graph, setGraph] = useState<TrailGraph | null>(null),
        [error, setError] = useState(''),
        [busy, setBusy] = useState(false)
    const [selected, setSelected] = useState<string>(),
        [collapsed, setCollapsed] = useState(new Set<string>())
    const [panelOpen, setPanelOpen] = useState(false)
    const panelRef = useRef<HTMLElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const [focusRequest, setFocusRequest] = useState<{ id: string; revision: number }>()
    const [refresh, setRefresh] = useState(0)
    const version = useRef(0)
    const key = `${projectId}:${conversationId}:${prefs.trailThreadId ?? ''}:${prefs.trailMessageId ?? ''}:${prefs.showHistory}:${revision}`
    useEffect(() => {
        const token = ++version.current
        let timer: ReturnType<typeof setTimeout> | undefined
        setGraph(null)
        setSelected(undefined)
        setPanelOpen(false)
        setFocusRequest(undefined)
        setCollapsed(new Set())
        setError('')
        if (!conversationId) return
        const poll = () => {
            timer = setTimeout(() => {
                if (document.hidden) poll()
                else void load()
            }, 5000)
        }
        const load = async () => {
            setBusy(true)
            try {
                const response = await request('requestData', {
                    query: {
                        parameters: {
                            operation: 'trail',
                            conversationId,
                            threadId: prefs.trailThreadId,
                            messageId: prefs.trailMessageId,
                            showHistory: prefs.showHistory
                        }
                    }
                })
                const result = trailGraphSchema.safeParse(
                    response && typeof response === 'object' && 'item' in response ? response.item : undefined
                )
                if (!result.success) throw Error(common.error)
                if (version.current !== token) return
                setGraph(result.data)
                setError('')
                if (result.data.live) poll()
            } catch (e) {
                if (version.current === token) setError(e instanceof Error ? e.message : common.error)
            } finally {
                if (version.current === token) setBusy(false)
            }
        }
        void load()
        return () => {
            version.current++
            clearTimeout(timer)
        }
    }, [key, refresh])
    const focus = (item: TrailStep) => setFocusRequest((old) => ({ id: item.id, revision: (old?.revision ?? 0) + 1 }))
    const choose = (item: TrailStep, fromList = false) => {
        setSelected(item.id)
        setPanelOpen(true)
        // List disclosure is independent; only expand diagram ancestors needed to reveal this leaf.
        setCollapsed((old) => {
            const next = new Set(old),
                visited = new Set<string>()
            let laneId: string | undefined = item.laneId
            while (laneId && !visited.has(laneId)) {
                visited.add(laneId)
                next.delete(laneId)
                laneId = graph?.lanes.find((lane) => lane.id === laneId)?.parentId ?? undefined
            }
            return next
        })
        if (fromList) focus(item)
    }
    const closePanel = () => {
        setPanelOpen(false)
        triggerRef.current?.focus({ preventScroll: true })
    }
    const open = (messageId: string, threadId?: string, targetConversationId = conversationId) => {
        if (!targetConversationId || !threadId) return
        locate({
            id: messageId,
            kind: 'turn',
            parentId: null,
            title: '',
            preview: '',
            expandable: false,
            capabilities: ['locate'],
            conversationId: targetConversationId,
            threadId,
            messageId
        })
    }
    const branches =
        graph?.layer === 'conversation'
            ? [
                  ...new Map(
                      graph.lanes
                          .filter((lane) => lane.threadId)
                          .map((lane) => [lane.threadId!, { value: lane.threadId!, label: lane.title || l.branch }])
                  ).values()
              ]
            : []
    return (
        <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            data-testid="trail-workspace"
            onKeyDown={(event) => {
                if (panelOpen && event.key === 'Escape' && !event.defaultPrevented) {
                    event.preventDefault()
                    event.stopPropagation()
                    closePanel()
                }
            }}
        >
            <div data-testid="trail-toolbar" className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
                <SearchSelect
                    key={`${projectId}:${revision}`}
                    cache={optionCache}
                    label={common.conversation}
                    placeholder={common.searchConversations}
                    value={conversationId ?? ''}
                    selectedLabel={
                        conversations.find((node) => node.conversationId === conversationId)?.title ??
                        graph?.title ??
                        common.conversation
                    }
                    scopeKey={`conversations:${projectId ?? 'unassigned'}`}
                    load={(search, offset) => readOptions({ kind: 'conversations', projectId, search, offset })}
                    labels={common}
                    onChange={(id) =>
                        update({ trailConversationId: id, trailThreadId: undefined, trailMessageId: undefined })
                    }
                    className="w-64 max-w-full"
                />
                {!!branches.length && (
                    <ChoiceSelect
                        label={l.selectBranch}
                        value={graph?.threadId ?? ''}
                        choices={branches}
                        onChange={(id) =>
                            update({
                                trailConversationId: conversationId,
                                trailThreadId: id,
                                trailMessageId: undefined
                            })
                        }
                        className="w-44 max-w-full"
                    />
                )}
                {prefs.trailMessageId && (
                    <Button variant="outline" size="sm" onClick={() => update({ trailMessageId: undefined })}>
                        <ArrowLeft aria-hidden />
                        {l.back}
                    </Button>
                )}
                <HistoryToggle prefs={prefs} update={update} labels={common} className="flex" />
                {graph?.source && (
                    <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                            open(graph.source!.messageId, graph.source!.threadId, graph.source!.conversationId)
                        }
                    >
                        {l.source}
                        <ArrowUpRight aria-hidden />
                    </Button>
                )}
                <span className="flex-1" />
                <Button
                    ref={triggerRef}
                    variant={panelOpen ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={!graph}
                    aria-expanded={panelOpen}
                    aria-label={l.list}
                    onClick={() => setPanelOpen((old) => !old)}
                >
                    <PanelRight aria-hidden />
                    {l.list}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                        optionCache.clear()
                        setRefresh((n) => n + 1)
                    }}
                >
                    <RefreshCw aria-hidden />
                    {l.refresh}
                </Button>
            </div>
            {error && (
                <p role="alert" className="px-5 py-3 text-sm text-destructive">
                    {error}
                </p>
            )}
            {!graph && (
                <p role="status" className="p-8 text-sm text-muted-foreground">
                    {busy ? common.loading : l.empty}
                </p>
            )}
            {graph && (
                <>
                    <h2 className="sr-only">{graph.layer === 'execution' ? l.execution : l.discussion}</h2>
                    <div className="relative flex min-h-0 flex-1 overflow-hidden" data-testid="trail-stage">
                        {graph.lanes.length ? (
                            <TrailTree
                                key={key}
                                graph={graph}
                                collapsed={collapsed}
                                selected={selected}
                                select={choose}
                                labels={l}
                                focusRequest={focusRequest}
                                panelOpen={panelOpen}
                                panelRef={panelRef}
                            />
                        ) : (
                            <p className="p-4 text-sm text-muted-foreground">{l.empty}</p>
                        )}
                        <TrailInspector
                            graph={graph}
                            open={panelOpen}
                            selected={selected}
                            panelRef={panelRef}
                            labels={l}
                            locale={locale}
                            locateLabel={common.locate}
                            collapsed={collapsed}
                            close={closePanel}
                            clear={() => setSelected(undefined)}
                            select={(item) => choose(item, true)}
                            fold={(laneId) =>
                                setCollapsed((old) => {
                                    const next = new Set(old)
                                    if (next.has(laneId)) next.delete(laneId)
                                    else next.add(laneId)
                                    return next
                                })
                            }
                            focusTree={(item) => {
                                closePanel()
                                focus(item)
                            }}
                            inspect={(item) =>
                                update({
                                    trailConversationId: graph.conversationId,
                                    trailThreadId: item.threadId ?? graph.threadId,
                                    trailMessageId: item.messageId
                                })
                            }
                            locate={(item) => {
                                if (item.messageId) open(item.messageId, item.threadId ?? graph.threadId)
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    )
}
