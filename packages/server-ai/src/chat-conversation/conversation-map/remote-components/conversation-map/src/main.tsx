import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { MessagesSquare, Network, Search, Plus, X, GitBranch, List, ArrowUpRight, Copy, Loader2 } from 'lucide-react'
import {
    Button,
    Input,
    ToggleGroup,
    ToggleGroupItem,
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
    Checkbox,
    TooltipProvider
} from '@xpert-ai/shadcn-ui'
import type { MapNode, MapPage, MapAction } from '../../../schema'
import { connect, read, act, navigate, navigationSchema, prefsSchema, savePrefs, request, type Prefs } from './bridge'
import { labels } from './i18n'
import { outlineNodes } from './layout'
import { ChoiceSelect, DisplaySettings } from './view-controls'
import { NodeUpdatedAt } from './node-details'
import { OutlineList } from './outline-list'
import { TopicGraph, icons, type NodeAction } from './graph'
type Edit = { type: 'create' | 'rename' | 'branch'; node?: MapNode }
function App() {
    const historyId = useId()
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
    const [more, setMore] = useState<Record<string, number | null>>({})
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
    const params = useMemo(
        () => ({ projectId: prefs.projectId, showHistory: prefs.showHistory, showShared: prefs.showShared }),
        [prefs.projectId, prefs.showHistory, prefs.showShared]
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
            const same = old.page?.projectId === result.projectId
            const nextExpanded = new Set(same ? old.expanded : [])
            nextExpanded.add(`project:${result.projectId ?? 'unassigned'}`)
            const nextLoaded = new Set<string>(),
                nextMore: Record<string, number | null> = {},
                nodes = [...result.nodes]
            if (!query) {
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
                    nextExpanded.add(node.id)
                    nextLoaded.add(node.id)
                    nextMore[node.id] = branches.nextOffset
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
                        nextExpanded.add(branch.id)
                        nextLoaded.add(branch.id)
                        nextMore[branch.id] = turns.nextOffset
                    }
                }
            }
            setPage(result)
            setItems(nodes)
            setExpanded(nextExpanded)
            setLoaded(nextLoaded)
            setMore(nextMore)
            setSelected(same ? (nodes.find((node) => node.id === old.selected?.id) ?? null) : null)
        } catch (e) {
            if (epoch.current === version) setError(e instanceof Error ? e.message : l.error)
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }, [ready, params, query, revision, locale])
    useEffect(() => {
        void reset()
        return () => {
            epoch.current++
        }
    }, [reset])
    const updatePrefs = (patch: Partial<Prefs>) => {
        const next = { ...prefsRef.current, ...patch }
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
    const loadChildren = async (node: MapNode, offset = 0) => {
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
            setItems((old) => [
                ...old.filter((item) => !result.nodes.some((next) => next.id === item.id)),
                ...result.nodes
            ])
            setLoaded((old) => new Set(old).add(node.id))
            setMore((old) => ({ ...old, [node.id]: result.nextOffset }))
            setExpanded((old) => new Set(old).add(node.id))
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
        else if (loaded.has(node.id) || node.kind === 'project') setExpanded((old) => new Set(old).add(node.id))
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
        if (mutation || !node.conversationId || !node.threadId) return
        if (kind === 'rename' || kind === 'branch') {
            setName(kind === 'rename' ? node.title : '')
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
            let offset = 0
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
                if (result.nextOffset === null) throw Error(l.empty)
                offset = result.nextOffset
            }
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }
    const submit = () => {
        if (!edit || !page) return
        if (edit.type === 'create')
            void perform({
                type: 'create',
                projectId: page.projectId,
                title: name.trim() || l.untitled,
                requestId: idempotency(`create:${page.projectId}:${name}`)
            })
        else if (edit.node?.conversationId && edit.node.threadId) {
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
        if (!page || page.nextOffset === null) return
        const version = epoch.current
        setBusy(true)
        try {
            const result = await read({ ...params, searchOffset: page.nextSearchOffset ?? 0 }, query, page.nextOffset)
            if (epoch.current === version) {
                setPage(result)
                setItems((old) => [
                    ...old.filter((node) => !result.nodes.some((next) => next.id === node.id)),
                    ...result.nodes
                ])
            }
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        } finally {
            if (epoch.current === version) setBusy(false)
        }
    }
    const loadProjects = async () => {
        if (!page || page.projectsNextOffset == null) return
        const version = epoch.current
        try {
            const result = z
                .object({
                    item: z.object({
                        projects: z.array(z.object({ id: z.string(), name: z.string() })),
                        nextOffset: z.number().nullable()
                    })
                })
                .parse(
                    await request('requestData', {
                        query: { parameters: { operation: 'projects', offset: page.projectsNextOffset } }
                    })
                )
            if (epoch.current !== version) return
            setPage((old) =>
                old
                    ? {
                          ...old,
                          projects: [...(old.projects ?? []), ...result.item.projects],
                          projectsNextOffset: result.item.nextOffset
                      }
                    : old
            )
        } catch (e) {
            if (epoch.current === version) setError(String(e))
        }
    }
    const root: MapNode = {
        id: `project:${page?.projectId ?? 'unassigned'}`,
        kind: 'project',
        title: page?.projectTitle ?? l.unassigned,
        preview: '',
        parentId: null,
        updatedAt: page?.projectUpdatedAt,
        expandable: true
    }
    const graphItems = useMemo(
        () => [root, ...items],
        [page?.projectId, page?.projectTitle, page?.projectUpdatedAt, items, locale]
    )
    const visibleItems = query
        ? items.map((node) => ({ node, depth: 1, guides: [] }))
        : outlineNodes(graphItems, expanded).filter(({ node }) => node.kind !== 'project')
    return (
        <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <header className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
                <MessagesSquare className="size-6" aria-hidden />
                <h1 className="text-xl font-semibold">{l.title}</h1>
                <ChoiceSelect
                    label={l.project}
                    className="w-52 max-w-full"
                    value={(prefs.projectId === undefined ? page?.projectId : prefs.projectId) ?? 'unassigned'}
                    onChange={(value) => updatePrefs({ projectId: value === 'unassigned' ? null : value })}
                    choices={[
                        { value: 'unassigned', label: l.unassigned },
                        ...(page?.projects ?? []).map((project) => ({ value: project.id, label: project.name })),
                        ...(page?.projectId && !page.projects?.some((project) => project.id === page.projectId)
                            ? [{ value: page.projectId, label: page.projectTitle }]
                            : [])
                    ]}
                />
                {page?.projectsNextOffset != null && (
                    <Button size="sm" variant="ghost" onClick={() => void loadProjects()}>
                        {l.loadProjects}
                    </Button>
                )}
                <div className="relative min-w-40 flex-1">
                    <Search aria-hidden className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                    <Input
                        className="pl-9"
                        aria-label={l.search}
                        placeholder={l.search}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        setName('')
                        setEdit({ type: 'create' })
                    }}
                >
                    <Plus aria-hidden />
                    {l.create}
                </Button>
            </header>
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-2">
                <ToggleGroup
                    type="single"
                    value={prefs.mode}
                    onValueChange={(value) => {
                        if (value === 'tree' || value === 'graph' || value === 'list') updatePrefs({ mode: value })
                    }}
                    aria-label={l.display}
                >
                    {(['graph', 'tree', 'list'] as const).map((mode) => {
                        const Icon = { graph: Network, tree: GitBranch, list: List }[mode]
                        return (
                            <ToggleGroupItem key={mode} value={mode} aria-label={l[mode]}>
                                <Icon className="size-4" aria-hidden />
                                {l[mode]}
                            </ToggleGroupItem>
                        )
                    })}
                </ToggleGroup>
                <ChoiceSelect
                    label={l.direction}
                    value={prefs.direction}
                    onChange={(value) => {
                        if (value === 'LR' || value === 'TB') updatePrefs({ direction: value })
                    }}
                    choices={[
                        { value: 'TB', label: l.vertical },
                        { value: 'LR', label: l.horizontal }
                    ]}
                />
                <div className="hidden items-center gap-2 sm:flex">
                    <Checkbox
                        id={historyId}
                        checked={prefs.showHistory}
                        onCheckedChange={(value) => updatePrefs({ showHistory: value === true })}
                    />
                    <Label htmlFor={historyId}>{l.history}</Label>
                </div>
                <DisplaySettings labels={l} prefs={prefs} update={updatePrefs} />
                {busy && <Loader2 className="size-4 animate-spin" aria-label={l.loading} />}
            </div>
            {error && (
                <div role="alert" className="flex items-center gap-3 border-b px-5 py-2 text-sm text-destructive">
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
                        {!items.length && !busy && (
                            <p className="py-10 text-center text-sm text-muted-foreground">{l.empty}</p>
                        )}
                    </div>
                ) : (
                    <TopicGraph
                        items={graphItems}
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
                {selected?.kind === 'turn' && (
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
                            <NodeUpdatedAt node={selected} labels={l} locale={locale} />
                            {selected.conversationTitle && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {l.conversation}: {selected.conversationTitle}
                                </p>
                            )}
                            <p className="my-3 whitespace-pre-line text-sm">{selected.preview}</p>
                            <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">{selected.answer}</p>
                            {selected.threadIds && selected.threadIds.length > 1 && (
                                <ChoiceSelect
                                    label={l.thread}
                                    className="mb-3 w-full"
                                    value={selected.threadId ?? selected.threadIds[0]}
                                    onChange={(value) => void selectBranch(selected, value)}
                                    choices={selected.threadIds.map((id, index) => ({
                                        value: id,
                                        label:
                                            selected.branchOptions?.find((option) => option.threadId === id)?.title ??
                                            `${l.thread} ${index + 1}`
                                    }))}
                                />
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button disabled={mutation} onClick={() => action('locate', selected)}>
                                    <ArrowUpRight aria-hidden />
                                    {l.locate}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={mutation || !selected.branchAvailable}
                                    onClick={() => action('branch', selected)}
                                >
                                    {l.branch}
                                </Button>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={l.copy}
                                    onClick={() => action('copy', selected)}
                                >
                                    <Copy aria-hidden />
                                </Button>
                            </div>
                            {!selected.branchAvailable && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {l.reasons[selected.branchReason as keyof typeof l.reasons] ?? l.unavailable}
                                </p>
                            )}
                        </PopoverContent>
                    </Popover>
                )}
            </section>
            <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
                {(['project', 'conversation', 'thread', 'turn'] as const).map((kind) => {
                    const Icon = icons[kind]
                    return (
                        <span key={kind} className="flex items-center gap-1">
                            <Icon className="size-4" aria-hidden />
                            {l[kind]}
                        </span>
                    )
                })}
                <span className="flex-1" />
                {page?.nextOffset != null && (
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
            <Dialog
                open={Boolean(edit)}
                onOpenChange={(open) => {
                    if (!open && !mutation) setEdit(null)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {edit?.type === 'create' ? l.create : edit?.type === 'branch' ? l.branch : l.rename}
                        </DialogTitle>
                        <DialogDescription>
                            {edit?.type === 'branch' ? l.forkHint : page?.projectTitle}
                        </DialogDescription>
                    </DialogHeader>
                    {edit?.type !== 'branch' && (
                        <>
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
                        </>
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
    )
}
createRoot(document.getElementById('root')!).render(
    <TooltipProvider>
        <App />
    </TooltipProvider>
)
