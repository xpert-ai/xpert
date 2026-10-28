import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import {
  Button,
  Badge,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@xpert-ai/shadcn-ui'
import {
  RefreshCw,
  Pause,
  Play,
  CalendarDays,
  Search,
  SlidersHorizontal,
  List,
  ChartNoAxesGantt,
  Sparkles,
  X
} from 'lucide-react'
import {
  executionObservationQuerySchema,
  executionObservationOverviewSchema,
  executionObservationStatusSchema,
  ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type ExecutionObservationOverview,
  type ExecutionObservationQuery
} from '@xpert-ai/contracts'
import { connect, request, actionSchema, analysisActionSchema } from './bridge'
import { I18nContext, i18n, useI18n } from './i18n'
import { ExecutionTimeline } from './timeline'
import { ExecutionDetail } from './detail'
import { ExecutionList } from './execution-list'
import { ZoomControls } from './zoom-controls'
import { SummaryMetrics } from './summary-metrics'
import { WorkspaceFilter } from './workspace-filter'
import { ObservationNotes } from './observation-notes'
import { fromViewQuery, navigationPayload, queryKey, queryParameters, type ViewState } from './navigation'

const localInput = (iso: string) => {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function View({ initialState, viewKey, synthetic }: { initialState: ViewState; viewKey: string; synthetic: boolean }) {
  const initial = initialState.query
  const { t, date, time } = useI18n()
  const [query, setQuery] = useState(initial),
    [data, setData] = useState<ExecutionObservationOverview | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [reload, setReload] = useState(0)
  const [live, setLive] = useState(initialState.live),
    [expanded, setExpanded] = useState(new Set(initialState.expanded)),
    [id, setId] = useState<string | null>(initialState.selected)
  const [timeScale, setTimeScale] = useState(initialState.timeScale),
    [expandedConversations, setExpandedConversations] = useState(new Set(initialState.expandedConversations))
  const [mode, setMode] = useState<'timeline' | 'list'>(initialState.mode),
    [summaryOpen, setSummaryOpen] = useState(false)
  const [selection, setSelection] = useState<ExecutionObservationQuery | null>(null),
    [analyzing, setAnalyzing] = useState(false)
  const [rangeOpen, setRangeOpen] = useState(false),
    [rangeFrom, setRangeFrom] = useState(localInput(initial.from)),
    [rangeTo, setRangeTo] = useState(localInput(initial.to))
  const [search, setSearch] = useState(initial.search ?? ''),
    [source, setSource] = useState(initial.source ?? '')
  const [recordedBy, setRecordedBy] = useState(initial.recordedById ?? '')
  const generation = useRef(0)
  const persist = (patch: Partial<ViewState>) => {
    const state: ViewState = {
      query,
      selected: id,
      expanded: [...expanded],
      expandedConversations: [...expandedConversations],
      timeScale,
      mode,
      live,
      ...patch
    }
    void request('invokeClientCommand', {
      commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND,
      payload: navigationPayload(viewKey, state)
    })
      .then((result) => {
        if (!actionSchema.parse(result).success) throw Error('Navigation rejected')
      })
      .catch(() => setError(t('actionFailed')))
  }
  const change = (patch: Partial<ExecutionObservationQuery>, liveState = live) => {
    const next = { ...query, ...patch, page: 1, asOf: undefined }
    setQuery(next)
    persist({ query: next, live: liveState })
  }
  const open = (value: string) => {
    setLive(false)
    setId(value)
    persist({ selected: value, live: false })
  }
  const expand = (next: Set<string>) => {
    setExpanded(next)
    persist({ expanded: [...next] })
  }
  const turnPage = (page: number) => {
    const next = { ...query, page }
    setQuery(next)
    persist({ query: next })
  }
  useEffect(() => {
    setQuery((current) => (queryKey(current) === queryKey(initialState.query) ? current : initialState.query))
    setTimeScale(initialState.timeScale)
    setExpandedConversations(new Set(initialState.expandedConversations))
    setExpanded(new Set(initialState.expanded))
    setId(initialState.selected)
    setMode(initialState.mode)
    setLive(initialState.live)
    setSearch(initialState.query.search ?? '')
    setSource(initialState.query.source ?? '')
    setRecordedBy(initialState.query.recordedById ?? '')
  }, [initialState])
  useEffect(() => {
    const version = ++generation.current
    setLoading(true)
    setError(null)
    request('requestData', {
      query: { page: query.page, pageSize: query.pageSize, parameters: queryParameters(query) }
    })
      .then((response) => {
        const result = z.object({ item: executionObservationOverviewSchema }).parse(response).item
        if (version === generation.current) setData(result)
      })
      .catch(() => {
        if (version === generation.current) {
          setError(t('failed'))
          setData(null)
        }
      })
      .finally(() => {
        if (version === generation.current) setLoading(false)
      })
    return () => {
      generation.current++
    }
  }, [query, reload, t])
  useEffect(() => {
    if (!live) return
    const interval = window.setInterval(() => {
      if (document.hidden) return
      setQuery((current) => {
        const end = Date.now()
        return {
          ...current,
          from: new Date(end - (Date.parse(current.to) - Date.parse(current.from))).toISOString(),
          to: new Date(end).toISOString(),
          asOf: undefined
        }
      })
    }, 10000)
    return () => window.clearInterval(interval)
  }, [live])
  const range = (from: number, to: number) => {
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      to - from > 31 * 86400000 ||
      from >= Date.now()
    ) {
      setError(t('invalidRange'))
      return
    }
    setLive(false)
    setRangeOpen(false)
    change({ from: new Date(from).toISOString(), to: new Date(to).toISOString() }, false)
  }
  const analyze = async () => {
    if (!data || analyzing) return
    setLive(false)
    setAnalyzing(true)
    setError(null)
    try {
      const prepared = analysisActionSchema.parse(
        await request('executeAction', { actionKey: 'analyze', input: data.query })
      )
      const sent = actionSchema.parse(
        await request('invokeClientCommand', {
          commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
          payload: { text: `${t('analysisRequest')}\n${JSON.stringify(prepared.data.query)}` }
        })
      )
      if (!sent.success) throw Error('Host rejected analysis')
    } catch {
      setError(t('actionFailed'))
    } finally {
      setAnalyzing(false)
    }
  }
  const clear = () => {
    setSearch('')
    setSource('')
    setRecordedBy('')
    change({
      search: undefined,
      source: undefined,
      workspaceId: undefined,
      assistantId: undefined,
      unknownAssistantOnly: undefined,
      recordedById: undefined,
      statuses: undefined
    })
  }
  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground">
      <header className="shrink-0 space-y-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('title')}{' '}
              {synthetic && (
                <Badge variant="outline" className="ml-2 align-middle text-xs font-normal">
                  {t('sample')}
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('refresh')}
              disabled={loading}
              onClick={() => setReload(reload + 1)}
            >
              <RefreshCw className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLive(!live)
                persist({ live: !live })
              }}
              aria-pressed={live}
            >
              {live ? <Pause /> : <Play />}
              {t(live ? 'live' : 'paused')}
            </Button>
            <Button onClick={() => void analyze()} disabled={!data || loading || analyzing}>
              <Sparkles />
              {t(analyzing ? 'analyzing' : 'analyze')}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover
            open={rangeOpen}
            onOpenChange={(value) => {
              if (value) {
                setRangeFrom(localInput(query.from))
                setRangeTo(localInput(query.to))
              }
              setRangeOpen(value)
            }}
          >
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarDays />
                <span className="max-w-60 truncate">
                  {date(query.from, query.timeZone)} — {date(query.to, query.timeZone)}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 space-y-3" align="start">
              <Label htmlFor="range-from">{t('from')}</Label>
              <Input
                id="range-from"
                type="datetime-local"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
              <Label htmlFor="range-to">{t('to')}</Label>
              <Input id="range-to" type="datetime-local" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              <p className="text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
              <Button
                className="w-full"
                onClick={() => range(new Date(rangeFrom).getTime(), new Date(rangeTo).getTime())}
              >
                {t('apply')}
              </Button>
            </PopoverContent>
          </Popover>
          <Select
            value={
              [1, 6, 24, 168].includes((Date.parse(query.to) - Date.parse(query.from)) / 3600000)
                ? String((Date.parse(query.to) - Date.parse(query.from)) / 3600000)
                : 'custom'
            }
            onValueChange={(value) => {
              const to = Date.now()
              range(to - Number(value) * 3600000, to)
            }}
          >
            <SelectTrigger className="w-24" aria-label={t('range')}>
              <SelectValue placeholder={t('range')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom" disabled>
                {t('customRange')}
              </SelectItem>
              {[1, 6, 24, 168].map((hours) => (
                <SelectItem key={hours} value={String(hours)}>
                  {hours} h
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <WorkspaceFilter value={query.workspaceId} onChange={(workspaceId) => change({ workspaceId })} />
          <Select
            value={query.countingUnit}
            onValueChange={(value) =>
              change({ countingUnit: value === 'assistant_invocation' ? 'assistant_invocation' : 'root_execution' })
            }
          >
            <SelectTrigger className="w-44" aria-label={t('counting')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root_execution">{t('roots')}</SelectItem>
              <SelectItem value="assistant_invocation">{t('invocations')}</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('selectStatus')}>
                <SlidersHorizontal />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <Label>{t('status')}</Label>
              <Select
                value={query.statuses?.[0] ?? 'all'}
                onValueChange={(value) =>
                  change({ statuses: value === 'all' ? undefined : [executionObservationStatusSchema.parse(value)] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all')}</SelectItem>
                  {executionObservationStatusSchema.options.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  change({ source: source || undefined })
                }}
              >
                <Label htmlFor="source">{t('source')}</Label>
                <Input
                  id="source"
                  maxLength={80}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={t('allSources')}
                />
                <Button type="submit" variant="outline" className="w-full">
                  {t('apply')}
                </Button>
              </form>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const parsed = z
                    .string()
                    .uuid()
                    .optional()
                    .safeParse(recordedBy.trim() || undefined)
                  if (parsed.success) change({ recordedById: parsed.data })
                  else setError(t('invalidCreator'))
                }}
              >
                <Label htmlFor="recorded-by">{t('recordCreator')}</Label>
                <Input
                  id="recorded-by"
                  value={recordedBy}
                  onChange={(e) => setRecordedBy(e.target.value)}
                  placeholder={t('creatorId')}
                />
                <Button type="submit" variant="outline" className="w-full">
                  {t('applyFilter')}
                </Button>
              </form>
              <Button variant="ghost" className="w-full" onClick={clear}>
                {t('clear')}
              </Button>
            </PopoverContent>
          </Popover>
          <form
            className="flex min-w-40 flex-1 gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              change({ search: search || undefined })
            }}
          >
            <Input
              aria-label={t('search')}
              maxLength={80}
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="ghost" size="icon" aria-label={t('search')}>
              <Search />
            </Button>
          </form>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-2">
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => setReload(reload + 1)}>
              {t('retry')}
            </Button>
          </div>
        )}
        {loading && !data && (
          <p role="status" className="py-12 text-center text-sm text-muted-foreground">
            {t('loading')}
          </p>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-4 text-sm tabular-nums">
                <span>
                  {t('running')} <strong>{data.summary.statuses.running}</strong>
                </span>
                <span>
                  {t('pending')} <strong>{data.summary.statuses.pending}</strong>
                </span>
                <span>
                  {t('interrupted')} <strong>{data.summary.statuses.interrupted}</strong>
                </span>
                <span>
                  {t('failedTotal')}{' '}
                  <strong className="text-destructive">
                    {data.summary.statuses.error + data.summary.statuses.timeout}
                  </strong>
                </span>
                <ObservationNotes data={data} />
                {(query.assistantId || query.unknownAssistantOnly) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => change({ assistantId: undefined, unknownAssistantOnly: undefined })}
                  >
                    {t('clearAssistant')}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {mode === 'timeline' && (
                  <ZoomControls
                    value={timeScale}
                    onChange={(value) => {
                      setTimeScale(value)
                      persist({ timeScale: value })
                    }}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => expand(new Set(data.assistants.map((a) => a.id ?? 'unknown')))}
                >
                  {t('expandAll')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => expand(new Set())}>
                  {t('collapseAll')}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t(mode === 'timeline' ? 'list' : 'timeline')}
                  onClick={() => {
                    const next = mode === 'timeline' ? 'list' : 'timeline'
                    setMode(next)
                    persist({ mode: next })
                  }}
                >
                  {mode === 'timeline' ? <List /> : <ChartNoAxesGantt />}
                </Button>
              </div>
            </div>
            {!data.summary.total ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <h2 className="font-medium">{t('empty')}</h2>
                <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
                <Button variant="outline" onClick={clear}>
                  {t('clear')}
                </Button>
              </div>
            ) : mode === 'list' ? (
              <ExecutionList query={data.query} open={open} />
            ) : (
              <ExecutionTimeline
                data={data}
                timeScale={timeScale}
                setTimeScale={(value) => {
                  setTimeScale(value)
                  persist({ timeScale: value })
                }}
                expandedConversations={expandedConversations}
                setExpandedConversations={(next) => {
                  setExpandedConversations(next)
                  persist({ expandedConversations: [...next] })
                }}
                expanded={expanded}
                setExpanded={expand}
                open={open}
                focus={(assistantId) => change({ assistantId, unknownAssistantOnly: undefined })}
                changeRange={range}
                segment={(assistantId, interval) => {
                  setLive(false)
                  setSelection({
                    ...data.query,
                    assistantId: assistantId ?? undefined,
                    unknownAssistantOnly: assistantId === null || undefined,
                    from: interval.start,
                    to: interval.end,
                    page: 1
                  })
                }}
              />
            )}
            <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {t('assistants', { count: data.totalAssistants })} · {t('records', { count: data.summary.total })} ·{' '}
                {t('observedAt', { time: time(data.summary.observedAt, query.timeZone) })}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSummaryOpen(true)}>
                  {t('analysis')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page === 1 || loading}
                  onClick={() => turnPage(query.page - 1)}
                >
                  {t('previous')}
                </Button>
                <span>
                  {t('page', { page: data.page, pages: Math.max(1, Math.ceil(data.totalAssistants / data.pageSize)) })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page * data.pageSize >= data.totalAssistants || loading}
                  onClick={() => turnPage(query.page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
      <ExecutionDetail
        timeZone={query.timeZone}
        id={id}
        close={() => {
          setId(null)
          persist({ selected: null })
        }}
        open={open}
      />
      <Dialog
        open={Boolean(selection)}
        onOpenChange={(value) => {
          if (!value) setSelection(null)
        }}
      >
        <DialogContent showCloseButton={false} className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label={t('close')}>
              <X />
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>{t('segment')}</DialogTitle>
            <DialogDescription>
              {selection && `${date(selection.from, query.timeZone)} — ${time(selection.to, query.timeZone)}`}
            </DialogDescription>
          </DialogHeader>
          {selection && (
            <ExecutionList
              query={selection}
              open={(id) => {
                setSelection(null)
                open(id)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent showCloseButton={false}>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2" aria-label={t('close')}>
              <X />
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>{t('analysis')}</DialogTitle>
            <DialogDescription>{t('resultCurrent')}</DialogDescription>
          </DialogHeader>
          {summaryOpen && data && <SummaryMetrics query={data.query} />}
        </DialogContent>
      </Dialog>
    </main>
  )
}

function App() {
  const [context, setContext] = useState<{
    locale: string
    state: ViewState
    revision: number
    viewKey: string
    synthetic: boolean
  } | null>(null)
  useEffect(
    () =>
      connect(
        (init) => {
          const locale = i18n(init.locale)
          document.documentElement.lang = locale.locale
          setContext({
            locale: init.locale,
            state: fromViewQuery(init.query),
            revision: init.revision,
            viewKey: init.viewKey,
            synthetic: init.synthetic
          })
        },
        () => setContext(null)
      ),
    []
  )
  const locale = useMemo(() => i18n(context?.locale ?? 'en-US'), [context?.locale])
  if (!context) return null
  return (
    <I18nContext.Provider value={locale}>
      <View
        key={context.revision}
        initialState={context.state}
        viewKey={context.viewKey}
        synthetic={context.synthetic}
      />
    </I18nContext.Provider>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
