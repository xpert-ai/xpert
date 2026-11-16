import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { ChevronDown, Inbox, RefreshCw, Search } from 'lucide-react'
import {
    applyRemoteComponentTheme,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Badge,
    Button,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableRow
} from '@xpert-ai/shadcn-ui'
import { connect, request } from '@xpert-ai/plugin-sdk/remote-component'
import { details, listing, states, type Page, type Row } from './model'
import { RemoteI18nProvider, useText } from './i18n'
import { TypeIcon } from './type-icon'

function Choice({
    value,
    onChange,
    label,
    items
}: {
    value: string
    onChange: (s: string) => void
    label: string
    items: { key: string; text: string }[]
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {items.map((i) => (
                    <SelectItem key={i.key} value={i.key}>
                        {i.text}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
function ResultDetails({ id, action }: { id: string; action: string }) {
    const { t, label } = useText()
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState<z.infer<typeof details>['result']>()
    const [failed, setFailed] = useState(false)
    useEffect(() => {
        if (!open) return
        let active = true
        setResult(undefined)
        setFailed(false)
        request('requestData', { query: { selectionId: id, parameters: { section: 'result' } } })
            .then((raw) => {
                const { item } = z.object({ item: details }).parse(raw)
                if (!item.result?.fields) throw new Error('result_unavailable')
                if (active) setResult(item.result)
            })
            .catch(() => {
                if (active) setFailed(true)
            })
        return () => {
            active = false
        }
    }, [id, open])
    return (
        <Collapsible
            open={open}
            onOpenChange={(value) => {
                setResult(undefined)
                setFailed(false)
                setOpen(value)
            }}
        >
            <CollapsibleTrigger asChild>
                <Button variant="outline">{action}</Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                {failed ? (
                    <p role="alert">{t('changed')}</p>
                ) : result ? (
                    <dl className="space-y-2 py-3">
                        {result.fields?.map((f) => (
                            <div key={f.label.en_US}>
                                <dt className="text-muted-foreground">{label(f.label)}</dt>
                                <dd className="break-words">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <Skeleton aria-label={t('loading')} className="h-14" />
                )}
            </CollapsibleContent>
        </Collapsible>
    )
}
function Detail({ id, refresh, onRetry }: { id: string; refresh: number; onRetry: () => void }) {
    const { t, label, time, number } = useText()
    const [row, setRow] = useState<z.infer<typeof details>>()
    const [error, setError] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        let active = true
        setRow(undefined)
        setError(false)
        setConfirm(false)
        request('requestData', { query: { selectionId: id } })
            .then((raw) => {
                const { item } = z.object({ item: details }).parse(raw)
                if (active) setRow(item)
            })
            .catch(() => {
                if (active) setError(true)
            })
        return () => {
            active = false
        }
    }, [id, refresh])
    async function openConversation() {
        if (busy) return
        setBusy(true)
        try {
            const result = await request('invokeClientCommand', {
                commandKey: 'open_conversation',
                payload: { receiptId: id }
            })
            if (!z.object({ success: z.literal(true) }).safeParse(result).success) throw Error()
        } catch {
            setRow(undefined)
            setError(true)
        } finally {
            setBusy(false)
        }
    }
    async function retry() {
        if (busy) return
        setBusy(true)
        try {
            const res = await request('executeAction', { actionKey: 'retry', targetId: id })
            if (!z.object({ success: z.literal(true) }).safeParse(res).success) throw Error()
            onRetry()
        } catch {
            setRow(undefined)
            setError(true)
        } finally {
            setBusy(false)
            setConfirm(false)
        }
    }
    if (error) return <p role="alert">{t('changed')}</p>
    if (!row) return <Skeleton aria-label={t('loading')} className="h-24 w-full" />
    function field(name: string, value: string | number) {
        return (
            <div key={name} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="break-all">{typeof value === 'number' ? number(value) : value}</dd>
            </div>
        )
    }
    return (
        <article className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                <TypeIcon icon={row.display?.icon} />
                {row.display ? label(row.display.label) : row.type}
                <Badge variant="outline">{t(row.state)}</Badge>
            </div>
            <h2 className="text-xl font-semibold break-words">{row.title || row.subject}</h2>
            <p className="text-muted-foreground">{row.assistant}</p>
            <Separator />
            <dl className="space-y-3">
                {field(t('subject'), row.subject)}
                {field(t('occurred'), time(row.occurredAt))}
                {field(t('received'), time(row.receivedAt))}
            </dl>
            {(row.decision || row.error || !!row.fields?.length) && (
                <>
                    <Separator />
                    <h3 className="font-medium">{t('result')}</h3>
                    <dl className="space-y-3">
                        {row.fields?.map((f) => field(label(f.label), f.value))}
                        {row.decision?.resultRef &&
                            field(t('resultRef'), row.decision.resultRef.kind + ' · ' + row.decision.resultRef.key)}
                        {(row.decision?.reasonCode || row.error) &&
                            field(t('reason'), row.decision?.reasonCode || row.error || '')}
                    </dl>
                </>
            )}
            {row.conversationAction && (
                <Button variant="outline" onClick={openConversation} disabled={busy}>
                    {t('openConversation')}
                </Button>
            )}
            {row.result && <ResultDetails id={id} action={label(row.result.action)} />}
            {row.canRetry && (
                <Button onClick={() => setConfirm(true)} disabled={busy}>
                    {t('retry')}
                </Button>
            )}
            <Separator />
            <Collapsible>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost">
                        <ChevronDown />
                        {t('technical')}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <dl className="space-y-2 py-3">
                        {field(t('receipt'), row.id)}
                        {field(t('type'), row.type)}
                        {field(t('version'), row.schemaVersion)}
                        {field(t('source'), row.sourceEventId)}
                        {field(t('attempt'), row.attempt)}
                        {row.decision?.operationKey && field(t('operation'), row.decision.operationKey)}
                    </dl>
                </CollapsibleContent>
            </Collapsible>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('confirm')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('confirmText')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction disabled={busy} onClick={() => void retry()}>
                            {t('retry')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </article>
    )
}
function InboxView() {
    const { t, label, time, number } = useText()
    const [search, setSearch] = useState(''),
        [term, setTerm] = useState(''),
        [category, setCategory] = useState('*'),
        [state, setState] = useState('*'),
        [assistant, setAssistant] = useState('*')
    const [page, setPage] = useState<Page>(),
        [selection, select] = useState(''),
        [revision, bump] = useState(0),
        [loading, setLoading] = useState(true),
        [failed, fail] = useState(false)
    const [narrow, setNarrow] = useState(() => window.innerWidth < 880),
        [sheetId, setSheetId] = useState('')
    const sheet = !!selection && sheetId === selection
    const seq = useRef(0),
        selectedButton = useRef<HTMLButtonElement | null>(null)
    useEffect(() => {
        const q = window.matchMedia('(max-width: 879px)')
        const update = () => setNarrow(q.matches)
        q.addEventListener('change', update)
        return () => q.removeEventListener('change', update)
    }, [])
    useEffect(() => {
        const timer = setTimeout(() => setTerm(search.trim()), 200)
        return () => clearTimeout(timer)
    }, [search])
    const params = {
        ...(category !== '*' ? { category } : {}),
        ...(state !== '*' ? { state } : {}),
        ...(assistant !== '*' ? { assistant } : {})
    }
    async function load(cursor?: string, retain?: Row) {
        const epoch = ++seq.current
        setLoading(true)
        fail(false)
        const fetchPage = async (after?: string) =>
            listing.parse(
                await request('requestData', {
                    query: { parameters: params, search: term, pageSize: 30, cursor: after }
                })
            )
        try {
            const result = await fetchPage(cursor)
            if (epoch !== seq.current) return
            // New receipts can push the selection past the first page. Stop once we pass its receipt time.
            while (retain && result.nextCursor && !result.items.some((item) => item.id === retain.id)) {
                const oldest = result.items.at(-1)
                if (!oldest || Date.parse(oldest.receivedAt) < Date.parse(retain.receivedAt)) break
                const next = await fetchPage(result.nextCursor)
                if (epoch !== seq.current) return
                result.items.push(...next.items)
                result.nextCursor = next.nextCursor
            }
            setPage((old) => (cursor && old ? { ...result, items: [...old.items, ...result.items] } : result))
            if (!cursor) select((old) => (result.items.some((i) => i.id === old) ? old : (result.items[0]?.id ?? '')))
        } catch {
            if (epoch === seq.current) {
                setPage(undefined)
                select('')
                fail(true)
            }
        } finally {
            if (epoch === seq.current) setLoading(false)
        }
    }
    useEffect(() => {
        setPage(undefined)
        select('')
        setSheetId('')
        void load()
        return () => {
            seq.current++
        }
    }, [category, state, assistant, term])
    function refresh() {
        bump((n) => n + 1)
        void load(
            undefined,
            page?.items.find((item) => item.id === selection)
        )
    }
    const categories = (page?.summary.categories ?? []).map((c) => ({
        key: c.key,
        text: c.display ? label(c.display.label) : t('uncategorized'),
        icon: c.display?.icon,
        count: c.count
    }))
    function clear() {
        setSearch('')
        setTerm('')
        setState('*')
        setCategory('*')
        setAssistant('*')
    }
    function pick(row: Row, button: HTMLButtonElement) {
        selectedButton.current = button
        select(row.id)
        setSheetId(narrow ? row.id : '')
    }
    const detailsPane = selection ? (
        <Detail key={selection} id={selection} refresh={revision} onRetry={refresh} />
    ) : (
        <p className="text-muted-foreground">{t('choose')}</p>
    )
    const all = { key: '*', text: t('all'), count: page?.summary.count ?? 0, icon: undefined }
    return (
        <main className="inbox-layout h-full bg-background text-foreground">
            <aside className="inbox-categories min-h-0 overflow-auto border-r p-4">
                <h2 className="mb-6 font-semibold">{page?.summary.personal ? t('personal') : t('inbox')}</h2>
                <nav aria-label={t('types')} className="space-y-1">
                    {[all, ...categories].map((c) => (
                        <Button
                            key={c.key}
                            variant={category === c.key ? 'secondary' : 'ghost'}
                            aria-pressed={category === c.key}
                            className="w-full justify-start"
                            onClick={() => setCategory(c.key)}
                        >
                            <TypeIcon icon={c.icon} />
                            {c.text}
                            <span className="ml-auto tabular-nums">{number(c.count)}</span>
                        </Button>
                    ))}
                </nav>
            </aside>
            <section className="flex min-w-0 min-h-0 flex-col border-r">
                <header className="space-y-3 border-b p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h1 className="font-semibold">
                            {page?.summary.personal ? t('inbox') : page?.summary.assistants[0]?.name || t('inbox')}
                        </h1>
                        <Button variant="ghost" size="icon" aria-label={t('refresh')} onClick={refresh}>
                            <RefreshCw />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search
                            size={16}
                            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            className="pl-9"
                            aria-label={t('search')}
                            placeholder={t('search')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="inbox-compact-types">
                            <Choice
                                label={t('types')}
                                value={category}
                                onChange={setCategory}
                                items={[all, ...categories]}
                            />
                        </div>
                        <Choice
                            label={t('state')}
                            value={state}
                            onChange={setState}
                            items={[
                                { key: '*', text: t('anyState') },
                                { key: 'attention', text: t('attention') },
                                ...states.map((s) => ({ key: s, text: t(s) }))
                            ]}
                        />
                        {page?.summary.personal && (
                            <Choice
                                label={t('assistant')}
                                value={assistant}
                                onChange={setAssistant}
                                items={[
                                    { key: '*', text: t('allAssistants') },
                                    ...page.summary.assistants.map((a) => ({ key: a.id, text: a.name }))
                                ]}
                            />
                        )}
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-busy={loading}>
                    <Table aria-label={t('inbox')} className="table-fixed">
                        <TableBody>
                            {page?.items.map((row) => (
                                <TableRow key={row.id} data-state={selection === row.id ? 'selected' : undefined}>
                                    <TableCell className="relative">
                                        <div className="flex min-w-0 items-start gap-2">
                                            <TypeIcon icon={row.display?.icon} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <span className="truncate">
                                                        {row.display ? label(row.display.label) : row.type}
                                                    </span>
                                                    <time className="ml-auto">{time(row.receivedAt, true)}</time>
                                                </div>
                                                <Button
                                                    variant="link"
                                                    className="max-w-full justify-start px-0 after:absolute after:inset-0"
                                                    aria-pressed={selection === row.id}
                                                    onClick={(e) => pick(row, e.currentTarget)}
                                                >
                                                    <span className="truncate">{row.title || row.subject}</span>
                                                </Button>
                                                <div className="flex items-center gap-2">
                                                    {page.summary.personal && (
                                                        <span className="truncate text-muted-foreground">
                                                            {row.assistant}
                                                        </span>
                                                    )}
                                                    <Badge variant="outline">{t(row.state)}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {loading && <Skeleton aria-label={t('loading')} className="h-14 w-full" />}
                    {failed && <p role="alert">{t('failed')}</p>}
                    {!loading && !failed && !page?.items.length && (
                        <div className="space-y-2 p-4">
                            <Inbox />
                            <p>
                                {t(
                                    category !== '*' || state !== '*' || assistant !== '*' || term ? 'noMatch' : 'empty'
                                )}
                            </p>
                            {(category !== '*' || state !== '*' || assistant !== '*' || term) && (
                                <Button variant="outline" onClick={clear}>
                                    {t('clear')}
                                </Button>
                            )}
                        </div>
                    )}
                    {page?.nextCursor && (
                        <Button disabled={loading} variant="ghost" onClick={() => void load(page.nextCursor)}>
                            {t('more')}
                        </Button>
                    )}
                </div>
            </section>
            {!narrow && (
                <section aria-label={t('detail')} className="min-w-0 overflow-auto p-6">
                    {detailsPane}
                </section>
            )}
            {narrow && (
                <Sheet open={sheet} onOpenChange={(open) => setSheetId(open ? selection : '')}>
                    <SheetContent
                        onCloseAutoFocus={(e) => {
                            e.preventDefault()
                            selectedButton.current?.focus()
                        }}
                        className="overflow-y-auto p-4"
                    >
                        <SheetHeader>
                            <SheetTitle>{t('detail')}</SheetTitle>
                            <SheetDescription className="sr-only">{t('inbox')}</SheetDescription>
                        </SheetHeader>
                        {sheet && detailsPane}
                    </SheetContent>
                </Sheet>
            )}
        </main>
    )
}
function App() {
    const [scope, setScope] = useState(0),
        [locale, setLocale] = useState('en-US')
    useEffect(() => {
        const change = () => setScope((n) => n + 1)
        return connect(({ locale: language, theme }, changed) => {
            applyRemoteComponentTheme(language, theme)
            try {
                setLocale(Intl.getCanonicalLocales(language.replaceAll('_', '-'))[0] ?? 'en-US')
            } catch {
                setLocale('en-US')
            }
            if (changed) change()
        }, change)
    }, [])
    return scope ? (
        <RemoteI18nProvider locale={locale}>
            <InboxView key={scope} />
        </RemoteI18nProvider>
    ) : null
}
createRoot(document.getElementById('root')!).render(<App />)
