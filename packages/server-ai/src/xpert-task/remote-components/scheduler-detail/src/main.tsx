import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Input, Label, Textarea } from '@xpert-ai/shadcn-ui'
import { connect, request, detailSchema, actionSchema, scheduleSchema, type Detail } from './bridge'
import { texts, statusText } from './i18n'

export function App() {
    const [locale, setLocale] = useState('en-US'),
        [selection, setSelection] = useState<string | null>(null)
    const [detail, setDetail] = useState<Detail | null>(null),
        [draft, setDraft] = useState<Detail | null>(null)
    const [page, setPage] = useState(1),
        [loading, setLoading] = useState(false),
        [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null),
        [notice, setNotice] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)
    const drafts = useRef(new Map<string, Detail>())
    const latest = useRef({ selection, dirty, draft }),
        generation = useRef(0)
    latest.current = { selection, dirty, draft }
    const t = texts(locale)
    useEffect(
        () =>
            connect((id, language) => {
                setLocale(language)
                if (id === latest.current.selection) return
                if (latest.current.dirty && latest.current.draft)
                    drafts.current.set(latest.current.draft.id, latest.current.draft)
                // Keep host selection and browser history aligned; retain edits per task while this View is open.
                setDirty(false)
                generation.current++
                setSelection(id)
                setPage(1)
                setDetail(null)
                setDraft(null)
                setLoading(false)
                setError(null)
                setNotice(null)
            }),
        []
    )
    const load = useCallback(
        async (replaceDraft = true) => {
            if (!selection) return
            const version = ++generation.current
            setLoading(true)
            setError(null)
            try {
                const result = detailSchema.parse(
                    await request('requestData', { query: { selectionId: selection, page, pageSize: 10 } })
                )
                if (version !== generation.current) return
                setDetail(result.item)
                if (replaceDraft) {
                    const cached = drafts.current.get(selection)
                    setDraft(cached ?? result.item)
                    setDirty(Boolean(cached))
                }
                return true
            } catch {
                if (version === generation.current) setError(t.failed)
            } finally {
                if (version === generation.current) setLoading(false)
            }
        },
        [selection, page, t.failed]
    )
    useEffect(() => {
        void load(!latest.current.dirty)
    }, [load])
    const action = async (key: string) => {
        if (!draft || busy) return
        const actionSelection = selection
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
            const input =
                key === 'save'
                    ? {
                          taskId: draft.id,
                          name: draft.name,
                          prompt: draft.prompt,
                          timeZone: draft.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                          options: draft.options
                      }
                    : { taskId: draft.id }
            const result = actionSchema.parse(await request('executeAction', { actionKey: key, input }))
            if (result.success && key === 'save') drafts.current.delete(draft.id)
            if (latest.current.selection !== actionSelection) return
            if (!result.success) throw Error(result.message || t.actionFailed)
            const loaded = await load(key === 'save' || !dirty)
            if (loaded && key === 'save') setNotice(t.saved)
        } catch (cause) {
            if (latest.current.selection === actionSelection)
                setError(cause instanceof Error ? cause.message : t.actionFailed)
        } finally {
            setBusy(false)
        }
    }
    const openRun = async (conversationId: string) => {
        if (!detail || busy) return
        const actionSelection = selection
        setBusy(true)
        setError(null)
        try {
            const result = actionSchema.parse(
                await request('executeAction', {
                    actionKey: 'execution-target',
                    input: { taskId: detail.id, conversationId }
                })
            )
            if (!result.success) throw Error(result.message || t.actionFailed)
            if (latest.current.selection !== actionSelection) return
            const opened = actionSchema.parse(
                await request('invokeClientCommand', { commandKey: 'workbench.navigation.open', payload: result.data })
            )
            if (!opened.success) throw Error(opened.message || t.actionFailed)
        } catch (cause) {
            if (latest.current.selection === actionSelection)
                setError(cause instanceof Error ? cause.message : t.actionFailed)
        } finally {
            setBusy(false)
        }
    }
    const change = (patch: Partial<Detail>) => {
        setDraft((value) => (value ? { ...value, ...patch } : value))
        setDirty(true)
        setNotice(null)
    }
    return (
        <main className="h-full overflow-auto bg-background text-foreground">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                <h1 className="min-w-0 break-words text-lg font-semibold">{detail?.name || t.title}</h1>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={!selection || loading || busy || dirty}
                    onClick={() => void load()}
                >
                    {t.refresh}
                </Button>
            </header>
            <div className="space-y-5 p-5">
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {notice && (
                    <p role="status" className="text-sm text-muted-foreground">
                        {notice}
                    </p>
                )}
                {loading && (
                    <p role="status" className="text-sm text-muted-foreground">
                        {t.loading}
                    </p>
                )}
                {!selection && <p className="text-sm text-muted-foreground">{t.empty}</p>}
                {detail && draft && (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="rounded-md bg-muted px-2 py-1 text-sm">
                                {statusText(t, detail.status)}
                            </span>
                            {detail.status !== 'archived' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busy || loading}
                                    onClick={() => void action(detail.status === 'paused' ? 'resume' : 'pause')}
                                >
                                    {detail.status === 'paused' ? t.resume : t.pause}
                                </Button>
                            )}
                        </div>
                        {detail.statusReason && <p className="text-sm text-muted-foreground">{detail.statusReason}</p>}
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void action('save')
                            }}
                        >
                            <fieldset className="space-y-4" disabled={busy || loading || detail.status === 'archived'}>
                                <div className="space-y-2">
                                    <Label htmlFor="name">{t.name}</Label>
                                    <Input
                                        id="name"
                                        required
                                        maxLength={100}
                                        value={draft.name}
                                        onChange={(e) => change({ name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="prompt">{t.prompt}</Label>
                                    <Textarea
                                        id="prompt"
                                        required
                                        rows={6}
                                        value={draft.prompt}
                                        onChange={(e) => change({ prompt: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="frequency">{t.frequency}</Label>
                                        <select
                                            id="frequency"
                                            value={draft.options.frequency}
                                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                            onChange={(e) =>
                                                change({
                                                    options: {
                                                        frequency: scheduleSchema.shape.frequency.parse(e.target.value),
                                                        time: draft.options.time
                                                    }
                                                })
                                            }
                                        >
                                            {scheduleSchema.shape.frequency.options.map((key) => (
                                                <option key={key} value={key}>
                                                    {t[key]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="time">{t.time}</Label>
                                        <Input
                                            id="time"
                                            type="time"
                                            required
                                            value={draft.options.time}
                                            onChange={(e) =>
                                                change({ options: { ...draft.options, time: e.target.value } })
                                            }
                                        />
                                    </div>
                                </div>
                                {draft.options.frequency === 'Weekly' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="weekday">{t.dayOfWeek}</Label>
                                        <Input
                                            id="weekday"
                                            type="number"
                                            required
                                            min={0}
                                            max={6}
                                            value={draft.options.dayOfWeek ?? ''}
                                            onChange={(e) =>
                                                change({
                                                    options: { ...draft.options, dayOfWeek: Number(e.target.value) }
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                {draft.options.frequency === 'Monthly' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="monthday">{t.dayOfMonth}</Label>
                                        <Input
                                            id="monthday"
                                            type="number"
                                            required
                                            min={1}
                                            max={31}
                                            value={draft.options.dayOfMonth ?? ''}
                                            onChange={(e) =>
                                                change({
                                                    options: { ...draft.options, dayOfMonth: Number(e.target.value) }
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                {['Once', 'Yearly'].includes(draft.options.frequency) && (
                                    <div className="space-y-2">
                                        <Label htmlFor="date">{t.date}</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            required
                                            value={draft.options.date ?? ''}
                                            onChange={(e) =>
                                                change({ options: { ...draft.options, date: e.target.value } })
                                            }
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="timezone">{t.timeZone}</Label>
                                    <Input
                                        id="timezone"
                                        required
                                        value={draft.timeZone || ''}
                                        placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
                                        onChange={(e) => change({ timeZone: e.target.value })}
                                    />
                                </div>
                                {dirty && (
                                    <p className="text-sm text-muted-foreground" role="status">
                                        {t.unsaved}
                                    </p>
                                )}
                                <Button type="submit" disabled={!dirty}>
                                    {t.save}
                                </Button>
                            </fieldset>
                        </form>
                        <section className="space-y-3">
                            <h2 className="border-b border-border pb-2 font-medium">{t.runs}</h2>
                            {!detail.runs.length && <p className="text-sm text-muted-foreground">{t.emptyRuns}</p>}
                            {detail.runs.map((run) => (
                                <div
                                    key={run.id}
                                    className="flex items-center justify-between gap-3 border-b border-border py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="break-words text-sm">{run.title || t.noTitle}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {statusText(t, run.status)} ·{' '}
                                            {run.createdAt ? new Date(run.createdAt).toLocaleString(locale) : ''}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() => void openRun(run.id)}
                                    >
                                        {t.open}
                                    </Button>
                                </div>
                            ))}
                            {detail.total > detail.pageSize && (
                                <div className="flex items-center justify-between gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={page === 1 || loading}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        {t.previous}
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                        {t.page} {page} {t.of} {Math.ceil(detail.total / detail.pageSize)}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={page * detail.pageSize >= detail.total || loading}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        {t.next}
                                    </Button>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </main>
    )
}
createRoot(document.getElementById('root')!).render(<App />)
