import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { X, ArrowUpRight, Copy, Loader2 } from 'lucide-react'
import {
    Button,
    Tabs,
    TabsContent,
    Input,
    Popover,
    PopoverAnchor,
    PopoverContent,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Label,
    TooltipProvider
} from '@xpert-ai/shadcn-ui'
import type { MapNode, MapPage, MapAction, MapEdge, MapCursor } from '../../../schema'
import {
    connect,
    read,
    act,
    navigate,
    locateNode,
    navigationSchema,
    prefsSchema,
    savePrefs,
    mergePrefs,
    preferredMapMode,
    type Prefs
} from './bridge'
import { labels } from './i18n'
import { outlineNodes } from './layout'
import { ChoiceSelect } from './view-controls'
import { MapHeader, MapToolbar } from './map-header'
import { OptionCache } from './option-cache'
import { NodeUpdatedAt, MessageMetadata } from './node-details'
import { OutlineList } from './outline-list'
import { TopicGraph, icons, type NodeAction } from './graph'
import { mapRepresentation, registerSegments, treeProjection } from './tree-mode'
import { TrailWorkspace } from './trail-workspace'
import { trailLabels } from './trail-i18n'
import { MapGrowth } from './map-growth'
import { mapHierarchy, mergeMapNodes, mergeMapEdges } from './map-model'
type Edit = { type: 'rename' | 'branch'; node: MapNode }
function App() {
    const headerRef = useRef<HTMLElement>(null)
    const editTrigger = useRef<HTMLElement | null>(null)
    const [locale, setLocale] = useState('zh-Hans'),
        [ready, setReady] = useState(false),
        [prefs, setPrefs] = useState<Prefs>(prefsSchema.parse({})),
        [revision, setRevision] = useState(0)
    const [page, setPage] = useState<MapPage | null>(null),
        [items, setItems] = useState<MapNode[]>([]),
        [expanded, setExpanded] = useState(new Set<string>()),
        [loaded, setLoaded] = useState(new Set<string>())
    const [selected, setSelected] = useState<MapNode | null>(null),
        [search, setSearch] = useState(''),
        [query, setQuery] = useState(''),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('')
    const [edit, setEdit] = useState<Edit | null>(null),
        [name, setName] = useState(''),
        [mutation, setMutation] = useState(false)
    const [more, setMore] = useState<Record<string, MapCursor | null>>({})
    const [edges, setEdges] = useState<MapEdge[]>([])
    const [participantId, setParticipantId] = useState('')
    const epoch = useRef(0),
        requests = useRef(new Map<string, string>()),
        l = labels(locale),
        prefsRef = useRef(prefs)
    prefsRef.current = prefs
    useEffect(
        () =>
            connect(
                (language, next) => {
                    setLocale(language)
                    setPrefs(next)
                    setSearch(next.search ?? '')
                    setQuery(next.search ?? '')
                    setReady(true)
                },
                () => {
                    epoch.current++
                    setRevision((n) => n + 1)
                }
            ),
        []
    )
    useEffect(() => {
        const timer = setTimeout(() => setQuery(search.trim()), 300)
        return () => clearTimeout(timer)
    }, [search])
    const optionCache = useMemo(() => new OptionCache(), [revision, locale])
    const displayMode = prefs.mode === 'tree' || prefs.mode === 'graph' ? 'map' : prefs.mode
    const representation =
        page && !page.capabilities.includes('segments') ? 'turns' : mapRepresentation(prefs.mode, query)
    const projectId = prefs.projectId === undefined ? page?.projectId : prefs.projectId
    const pageMatchesProject = projectId === page?.projectId
    const params = useMemo(
        () => ({
            projectId: prefs.projectId,
            showHistory: prefs.showHistory,
            showShared: prefs.showShared,
            representation,
            participantId: participantId || undefined
        }),
        [prefs.projectId, prefs.showHistory, prefs.showShared, representation, participantId]
    )
    const snapshot = useRef({ page, items, expanded, selected })
    snapshot.current = { page, items, expanded, selected }
    const reset = useCallback(async () => {
        if (!ready) return
        const version = ++epoch.current
        setBusy(true)
        setError('')
        try {
            const old = snapshot.current,
                result = await read(params, query)
            if (epoch.current !== version) return
            const same = old.page?.scope.id === result.scope.id
            const nextExpanded = new Set(same ? old.expanded : [])
            nextExpanded.add(`project:${result.projectId ?? 'unassigned'}`)
            const nextLoaded = new Set<string>(),
                nextMore: Record<string, MapCursor | null> = {},
                nodes = [...result.nodes],
                nextEdges = [...result.edges]
            if (!query && result.capabilities.includes('segments') && prefsRef.current.mode !== 'growth') {
                for (const node of result.nodes) {
                    if (
                        node.kind !== 'conversation' ||
                        (!nextExpanded.has(node.id) && node.conversationId !== result.currentConversationId)
                    )
                        continue
                    const branches = await read({
                        ...params,
                        projectId: result.projectId,
                        conversationId: node.conversationId
                    })
                    if (epoch.current !== version) return
                    nodes.push(...branches.nodes)
                    nextEdges.push(...branches.edges)
                    nextExpanded.add(node.id)
                    nextLoaded.add(node.id)
                    nextMore[node.id] = branches.pageInfo.next
                    if (representation === 'segments') {
                        registerSegments(
                            branches.nodes,
                            nextExpanded,
                            nextLoaded,
                            new Set(old.items.map((item) => item.id))
                        )
                        continue
                    }
                    for (const branch of branches.nodes) {
                        if (
                            !nextExpanded.has(branch.id) &&
                            !(branch.current && node.conversationId === result.currentConversationId)
                        )
                            continue
                        const turns = await read({
                            ...params,
                            projectId: result.projectId,
                            conversationId: node.conversationId,
                            threadId: branch.threadId
                        })
                        if (epoch.current !== version) return
                        nodes.push(...turns.nodes)
                        nextEdges.push(...turns.edges)
                        nextExpanded.add(branch.id)
                        nextLoaded.add(branch.id)
                        nextMore[branch.id] = turns.pageInfo.next
                    }
                }
            }
            if (!result.capabilities.includes('segments'))
                for (const node of nodes) {
                    if (!same || !old.items.some((item) => item.id === node.id)) nextExpanded.add(node.id)
                    nextLoaded.add(node.id)
                }
            setPage(result)
            setEdges(nextEdges)
            setItems(nodes)
            setExpanded(nextExpanded)
            setLoaded(nextLoaded)
            setMore(nextMore)
            setSelected(same ? (nodes.find((node) => node.id === old.selected?.id) ?? null) : null)
        } catch (e) {
            if (epoch.current === version) {
                setError(e instanceof Error ? e.message : l.error)
                setPage(null)
                setItems([])
                setEdges([])
                setSelected(null)
            }
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }, [ready, params, query, revision, locale, representation, prefs.mode === 'growth'])
    useEffect(() => {
        void reset()
        return () => {
            epoch.current++
        }
    }, [reset])
    const updatePrefs = (patch: Partial<Prefs>) => {
        const next = mergePrefs(prefsRef.current, patch)
        setPrefs(next)
        void savePrefs(next).catch((e) => setError(String(e)))
    }
    useEffect(() => {
        if (!ready || query !== search.trim() || query === (prefsRef.current.search ?? '')) return
        const next = { ...prefsRef.current, search: query }
        setPrefs(next)
        const version = epoch.current
        void savePrefs(next).catch((error) => {
            if (version === epoch.current) setError(String(error))
        })
    }, [ready, query, search])
    const loadChildren = async (node: MapNode, offset: MapCursor | number = 0) => {
        const version = epoch.current
        setBusy(true)
        setError('')
        try {
            const result = await read(
                {
                    ...params,
                    conversationId: node.conversationId,
                    ...(node.kind === 'thread' ? { threadId: node.threadId } : {})
                },
                '',
                offset
            )
            if (epoch.current !== version) return
            setItems((old) => {
                const nodes = [
                    ...old.filter((item) => !result.nodes.some((next) => next.id === item.id)),
                    ...result.nodes
                ]
                return nodes
            })
            setLoaded((old) => {
                const next = new Set(old).add(node.id)
                registerSegments(result.nodes, new Set(), next)
                return next
            })
            setMore((old) => ({ ...old, [node.id]: result.pageInfo.next }))
            setEdges((old) => mergeMapEdges(old, result.edges))
            setExpanded((old) => {
                const next = new Set(old).add(node.id)
                registerSegments(result.nodes, next, new Set(), new Set(items.map((item) => item.id)))
                return next
            })
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }
    const toggle = (node: MapNode) => {
        if (expanded.has(node.id))
            setExpanded((old) => {
                const next = new Set(old)
                next.delete(node.id)
                return next
            })
        else if (loaded.has(node.id) || node.kind === 'project' || node.kind === 'segment')
            setExpanded((old) => new Set(old).add(node.id))
        else void loadChildren(node)
    }
    const idempotency = (key: string) => {
        let id = requests.current.get(key)
        if (!id) {
            id = crypto.randomUUID()
            requests.current.set(key, id)
        }
        return id
    }
    const perform = async (input: MapAction, copy = false) => {
        const version = epoch.current
        setMutation(true)
        setError('')
        try {
            const result = await act(input)
            if (epoch.current !== version) return
            if (input.type !== 'locate') optionCache.clear()
            if (input.type === 'rename') {
                setEdit(null)
                await reset()
                return
            }
            const target = navigationSchema.parse(result)
            // Once creation is acknowledged, a subsequent deliberate action is a new request.
            // Unknown network outcomes keep their key, so retry cannot create duplicates.
            if (input.type !== 'locate') requests.current.clear()
            setEdit(null)
            await navigate(target, copy)
            if (copy) setNotice(l.copied)
            else {
                setEdit(null)
                if (input.type !== 'locate') await reset()
            }
        } catch (e) {
            if (epoch.current === version) setError(e instanceof Error ? e.message : l.error)
        } finally {
            setMutation(false)
        }
    }
    const action = (kind: NodeAction, node: MapNode) => {
        if (mutation || !node.capabilities.includes(kind) || !node.conversationId || !node.threadId) return
        if (kind === 'locate' && node.anchor?.target === 'group.message') {
            void locateNode(node).catch((error) => setError(String(error)))
            return
        }
        if (kind === 'rename' || kind === 'branch') {
            setName(kind === 'rename' ? node.title : '')
            editTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            setEdit({ type: kind, node })
            return
        }
        if (kind === 'side-chat') {
            void perform({
                type: 'side-chat',
                conversationId: node.conversationId,
                threadId: node.threadId,
                requestId: idempotency(`side:${node.threadId}`)
            })
            return
        }
        void perform(
            {
                type: 'locate',
                conversationId: node.conversationId,
                threadId: node.threadId,
                ...(node.messageId ? { messageId: node.messageId } : {})
            },
            kind === 'copy'
        )
    }
    const selectBranch = async (node: MapNode, threadId: string) => {
        const version = epoch.current
        setBusy(true)
        try {
            let offset: MapCursor | number = 0
            for (;;) {
                const result = await read(
                    { ...params, conversationId: node.conversationId, threadId, showShared: true },
                    '',
                    offset
                )
                if (epoch.current !== version) return
                const turn = result.nodes.find((item) => item.messageId === node.messageId)
                if (turn) {
                    setSelected({
                        ...turn,
                        threadIds: node.threadIds,
                        branchOptions: node.branchOptions,
                        path: node.path?.map((part) =>
                            part.id.startsWith('thread:')
                                ? {
                                      id: `thread:${threadId}`,
                                      title:
                                          node.branchOptions?.find((option) => option.threadId === threadId)?.title ??
                                          l.thread
                                  }
                                : part
                        )
                    })
                    return
                }
                if (result.pageInfo.next === null) throw Error(l.empty)
                offset = result.pageInfo.next
            }
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }
    const submit = () => {
        if (!edit || !page) return
        if (edit.node?.conversationId && edit.node.threadId) {
            const n = edit.node
            if (edit.type === 'rename')
                void perform({
                    type: 'rename',
                    conversationId: n.conversationId!,
                    ...(n.kind === 'thread' ? { threadId: n.threadId } : {}),
                    title: name.trim()
                })
            else if (n.branchMessageId)
                void perform({
                    type: 'branch',
                    conversationId: n.conversationId!,
                    threadId: n.threadId!,
                    messageId: n.branchMessageId,
                    requestId: idempotency(`branch:${n.threadId}:${n.branchMessageId}`)
                })
        }
    }
    const loadRoot = async () => {
        if (!page?.pageInfo.next) return
        const version = epoch.current
        setBusy(true)
        try {
            const result = await read(params, query, page.pageInfo.next)
            if (epoch.current === version) {
                setPage(result)
                setEdges((old) => mergeMapEdges(old, result.edges))
                setExpanded((old) => new Set([...old, ...result.nodes.map((node) => node.id)]))
                setLoaded((old) => new Set([...old, ...result.nodes.map((node) => node.id)]))
                setItems((old) => {
                    const nodes = mergeMapNodes(old, result.nodes)
                    return nodes
                })
            }
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }
    useEffect(() => {
        if (!page?.capabilities.includes('live') || busy) return
        const version = epoch.current
        let active = true
        const timer = setTimeout(async () => {
            if (document.hidden) return
            try {
                const next = await read(params, query)
                if (!active || version !== epoch.current || next.scope.id !== page.scope.id) return
                setPage({ ...next, pageInfo: { ...next.pageInfo, next: page.pageInfo.next } })
                setItems((old) => mergeMapNodes(old, next.nodes))
                setEdges((old) => mergeMapEdges(old, next.edges))
                setExpanded(
                    (old) =>
                        new Set([
                            ...old,
                            ...next.nodes
                                .filter((node) => !snapshot.current.items.some((item) => item.id === node.id))
                                .map((node) => node.id)
                        ])
                )
            } catch (error) {
                if (active && version === epoch.current) {
                    setError(String(error))
                    setPage(null)
                    setItems([])
                    setEdges([])
                    setSelected(null)
                }
            }
        }, 10000)
        const resume = () => {
            if (!document.hidden) setRevision((value) => value + 1)
        }
        document.addEventListener('visibilitychange', resume)
        return () => {
            active = false
            clearTimeout(timer)
            document.removeEventListener('visibilitychange', resume)
        }
    }, [page, params, query, busy])
    const root: MapNode = {
        id: `project:${page?.projectId ?? 'unassigned'}`,
        kind: 'project',
        title: page?.projectTitle ?? l.unassigned,
        preview: '',
        parentId: null,
        updatedAt: page?.projectUpdatedAt,
        expandable: true,
        capabilities: []
    }
    const graphItems = useMemo(() => {
        const nodes = mapHierarchy(
            [
                root,
                ...items.filter((node) =>
                    representation === 'segments'
                        ? node.kind !== 'thread' && node.kind !== 'turn'
                        : node.kind !== 'segment'
                )
            ],
            edges,
            prefs.mode === 'graph'
        )
        return representation === 'segments' ? treeProjection(nodes) : nodes
    }, [edges, prefs.mode, page?.projectId, page?.projectTitle, page?.projectUpdatedAt, items, locale, representation])
    const visibleItems = query
        ? items
              .filter(
                  (node) =>
                      node.kind !== 'segment' &&
                      (!page?.capabilities.includes('participants') || node.kind === 'message')
              )
              .map((node) => ({ node, depth: 1, guides: [] }))
        : outlineNodes(graphItems, expanded).filter(({ node }) => node.kind !== 'project')
    return (
        <Tabs
            asChild
            value={displayMode}
            onValueChange={(value) => {
                if (value === 'map' || value === 'list' || value === 'growth')
                    updatePrefs({ mode: value === 'map' ? preferredMapMode(prefs) : value })
            }}
            className="h-full min-h-0 gap-0"
        >
            <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
                <MapHeader
                    prefs={prefs}
                    update={updatePrefs}
                    labels={l}
                    page={page}
                    search={search}
                    setSearch={setSearch}
                    revision={revision}
                    headerRef={headerRef}
                    optionCache={optionCache}
                />
                <TabsContent value={displayMode} className="flex min-h-0 flex-1 flex-col">
                    {(prefs.mode !== 'growth' || !!query || !page?.capabilities.includes('execution-trail')) && (
                        <MapToolbar
                            prefs={prefs}
                            update={updatePrefs}
                            labels={l}
                            searching={!!query}
                            segments={representation === 'segments'}
                            busy={busy}
                            page={page}
                            participantId={participantId}
                            setParticipantId={setParticipantId}
                            refresh={() => void reset()}
                        />
                    )}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-3 border-b px-5 py-2 text-sm text-destructive"
                        >
                            <span className="flex-1">{error}</span>
                            <Button variant="outline" size="sm" onClick={() => void reset()}>
                                {l.retry}
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={l.close} onClick={() => setError('')}>
                                <X aria-hidden />
                            </Button>
                        </div>
                    )}
                    {notice && (
                        <div className="flex items-center gap-2 px-5 py-2 text-sm" role="status">
                            <span className="flex-1">{notice}</span>
                            <Button variant="ghost" size="icon-sm" aria-label={l.close} onClick={() => setNotice('')}>
                                <X className="size-4" aria-hidden />
                            </Button>
                        </div>
                    )}
                    <section className="relative flex min-h-0 flex-1">
                        {query || prefs.mode === 'list' ? (
                            <div className="min-w-0 flex-1 overflow-auto px-3 py-2">
                                <OutlineList
                                    entries={visibleItems}
                                    expanded={expanded}
                                    selected={selected?.id}
                                    query={query}
                                    labels={l}
                                    locale={locale}
                                    pending={mutation}
                                    select={setSelected}
                                    toggle={toggle}
                                    action={action}
                                />
                                {!visibleItems.length && !busy && (
                                    <p className="py-10 text-center text-sm text-muted-foreground">{l.empty}</p>
                                )}
                            </div>
                        ) : prefs.mode === 'growth' && page?.capabilities.includes('execution-trail') ? (
                            <TrailWorkspace
                                projectId={projectId}
                                optionCache={optionCache}
                                conversations={
                                    pageMatchesProject ? items.filter((node) => node.kind === 'conversation') : []
                                }
                                currentConversationId={pageMatchesProject ? page?.currentConversationId : undefined}
                                prefs={prefs}
                                update={updatePrefs}
                                revision={revision}
                                locale={locale}
                                locate={(node) => action('locate', node)}
                            />
                        ) : prefs.mode === 'growth' && page ? (
                            <MapGrowth
                                nodes={items}
                                edges={edges}
                                title={page.scope.title}
                                locale={locale}
                                selected={selected?.id}
                                select={setSelected}
                            />
                        ) : (
                            <TopicGraph
                                items={graphItems}
                                edges={edges}
                                expanded={expanded}
                                prefs={prefs}
                                labels={l}
                                locale={locale}
                                pending={mutation}
                                direction={prefs.direction}
                                select={setSelected}
                                toggle={toggle}
                                action={action}
                                selected={selected?.id}
                            />
                        )}
                        {selected &&
                            (selected.kind === 'turn' || selected.kind === 'message') &&
                            (prefs.mode !== 'growth' || !page?.capabilities.includes('execution-trail')) && (
                                <Popover
                                    open
                                    onOpenChange={(open) => {
                                        if (!open) setSelected(null)
                                    }}
                                >
                                    <PopoverAnchor className="pointer-events-none absolute bottom-14 right-4" />
                                    <PopoverContent
                                        side="top"
                                        align="end"
                                        aria-label={l.preview}
                                        className="max-h-[65vh] w-[min(360px,calc(100vw_-_2rem))] overflow-auto"
                                        onOpenAutoFocus={(event) => event.preventDefault()}
                                    >
                                        <div className="flex items-start gap-2">
                                            <h2 className="min-w-0 flex-1 text-sm font-semibold">{selected.title}</h2>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={l.close}
                                                onClick={() => setSelected(null)}
                                            >
                                                <X aria-hidden />
                                            </Button>
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {selected.path?.map((part) => part.title).join(' / ')}
                                        </p>
                                        <MessageMetadata node={selected} labels={l} participants={page?.participants} />
                                        <NodeUpdatedAt node={selected} labels={l} locale={locale} />
                                        {selected.conversationTitle && (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {l.conversation}: {selected.conversationTitle}
                                            </p>
                                        )}
                                        <p className="my-3 whitespace-pre-line text-sm">{selected.preview}</p>
                                        <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">
                                            {selected.answer}
                                        </p>
                                        {selected.threadIds && selected.threadIds.length > 1 && (
                                            <ChoiceSelect
                                                label={l.thread}
                                                className="mb-3 w-full"
                                                value={selected.threadId ?? selected.threadIds[0]}
                                                onChange={(value) => void selectBranch(selected, value)}
                                                choices={selected.threadIds.map((id, index) => ({
                                                    value: id,
                                                    label:
                                                        selected.branchOptions?.find((option) => option.threadId === id)
                                                            ?.title ?? `${l.thread} ${index + 1}`
                                                }))}
                                            />
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            {selected.capabilities.includes('inspect') && selected.branchMessageId && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => {
                                                        updatePrefs({
                                                            mode: 'growth',
                                                            trailConversationId: selected.conversationId,
                                                            trailThreadId: selected.threadId,
                                                            trailMessageId: selected.branchMessageId,
                                                            search: ''
                                                        })
                                                        setSearch('')
                                                        setQuery('')
                                                        setSelected(null)
                                                    }}
                                                >
                                                    {trailLabels(locale).inspect}
                                                </Button>
                                            )}
                                            <Button disabled={mutation} onClick={() => action('locate', selected)}>
                                                <ArrowUpRight aria-hidden />
                                                {l.locate}
                                            </Button>
                                            {selected.capabilities.includes('branch') && (
                                                <Button
                                                    variant="outline"
                                                    disabled={mutation || !selected.branchAvailable}
                                                    onClick={() => action('branch', selected)}
                                                >
                                                    {l.branch}
                                                </Button>
                                            )}
                                            {selected.capabilities.includes('copy') && (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label={l.copy}
                                                    onClick={() => action('copy', selected)}
                                                >
                                                    <Copy aria-hidden />
                                                </Button>
                                            )}
                                        </div>
                                        {selected.kind === 'turn' && !selected.branchAvailable && (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                {l.reasons[selected.branchReason as keyof typeof l.reasons] ??
                                                    l.unavailable}
                                            </p>
                                        )}
                                    </PopoverContent>
                                </Popover>
                            )}
                    </section>
                    {(prefs.mode !== 'growth' || !!query || !page?.capabilities.includes('execution-trail')) && (
                        <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
                            {prefs.mode !== 'growth' &&
                                (page?.capabilities.includes('participants')
                                    ? (['project', 'conversation', 'message'] as const)
                                    : representation === 'segments'
                                      ? (['project', 'conversation', 'segment'] as const)
                                      : (['project', 'conversation', 'thread', 'turn'] as const)
                                ).map((kind) => {
                                    const Icon = icons[kind]
                                    return (
                                        <span key={kind} className="flex items-center gap-1">
                                            <Icon className="size-4" aria-hidden />
                                            {l[kind]}
                                        </span>
                                    )
                                })}
                            <span className="flex-1" />
                            {page?.pageInfo.next != null && (
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void loadRoot()}>
                                    {query ? l.searchMore : l.more}
                                </Button>
                            )}
                            {Object.entries(more)
                                .filter(([id, offset]) => offset !== null && expanded.has(id))
                                .map(([id, offset]) => (
                                    <Button
                                        key={id}
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() => {
                                            const node = items.find((n) => n.id === id)
                                            if (node) void loadChildren(node, offset!)
                                        }}
                                    >
                                        {items.find((n) => n.id === id)?.title} · {l.more}
                                    </Button>
                                ))}
                        </footer>
                    )}
                </TabsContent>
                <Dialog
                    open={Boolean(edit)}
                    onOpenChange={(open) => {
                        if (!open && !mutation) setEdit(null)
                    }}
                >
                    <DialogContent
                        onCloseAutoFocus={(event) => {
                            event.preventDefault()
                            const trigger = editTrigger.current?.isConnected ? editTrigger.current : headerRef.current
                            trigger?.focus()
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{edit?.type === 'branch' ? l.branch : l.rename}</DialogTitle>
                            <DialogDescription>
                                {edit?.type === 'branch' ? l.forkHint : page?.projectTitle}
                            </DialogDescription>
                        </DialogHeader>
                        {edit?.type !== 'branch' && (
                            <div className="grid gap-3">
                                <Label htmlFor="topic-name">{l.name}</Label>
                                <Input
                                    id="topic-name"
                                    value={name}
                                    maxLength={160}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !mutation) submit()
                                    }}
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" disabled={mutation} onClick={() => setEdit(null)}>
                                {l.cancel}
                            </Button>
                            <Button disabled={mutation || (edit?.type === 'rename' && !name.trim())} onClick={submit}>
                                {mutation ? <Loader2 size={16} className="animate-spin" /> : l.save}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
        </Tabs>
    )
}
createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
        <App />
    </TooltipProvider>
)
