import { useMemo, useRef } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { ChevronDown, ChevronRight, Focus } from 'lucide-react'
import type { ExecutionObservationOverview, ExecutionObservationSegment } from '@xpert-ai/contracts'
import { useI18n } from './i18n'
import { AssistantAvatar } from './assistant-avatar'
import { useDragScroll } from './drag-scroll'
import { createReadQueue } from './read-queue'
import { ConversationLoader } from './conversation-loader'
import { ConversationRows } from './conversation-rows'
import { useTimelineViewport } from './use-timeline-viewport'
import { LABEL_WIDTH, SCROLL_GUTTER, position } from './timeline-layout'
import { SummaryTrack } from './timeline-track'
import { OverlapOverview } from './trend'

export function ExecutionTimeline({
  data,
  expanded,
  setExpanded,
  expandedConversations,
  setExpandedConversations,
  timeScale,
  setTimeScale,
  open,
  focus,
  segment,
  changeRange
}: {
  data: ExecutionObservationOverview
  expanded: Set<string>
  setExpanded: (next: Set<string>) => void
  expandedConversations: Set<string>
  setExpandedConversations: (next: Set<string>) => void
  timeScale: number
  setTimeScale: (scale: number) => void
  open: (id: string) => void
  focus: (id: string) => void
  segment: (assistantId: string | null, range: ExecutionObservationSegment) => void
  changeRange: (from: number, to: number) => void
}) {
  const { t, time, day, date } = useI18n(),
    { dragging, handlers } = useDragScroll()
  const queued = useMemo(() => createReadQueue(3), []),
    startPointer = useRef<number | null>(null)
  const from = Date.parse(data.query.from),
    to = Date.parse(data.query.to),
    span = to - from
  const {
    ref,
    onScroll,
    viewport: view
  } = useTimelineViewport(from, to, Date.parse(data.summary.asOf), timeScale, data.query.timeZone, setTimeScale)
  const tickLabel = (tick: number) =>
    view.step >= 86400000
      ? day(tick, view.timeZone)
      : span > 86400000
        ? `${day(tick, view.timeZone)} ${time(tick, view.timeZone)}`
        : time(tick, view.timeZone)
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      {...handlers}
      tabIndex={0}
      role="region"
      aria-label={t('panTimeline')}
      className={`min-h-0 min-w-0 flex-1 select-none overflow-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      data-testid="execution-timeline"
    >
      <div
        className="pr-[16px]"
        data-testid="timeline-canvas"
        style={{ width: LABEL_WIDTH + view.plotWidth + SCROLL_GUTTER }}
      >
        <div className="sticky top-0 z-30 bg-background">
          <OverlapOverview data={data} view={view} />
          <div className="grid grid-cols-[288px_minmax(0,1fr)] border-b border-border bg-background">
            <div className="sticky left-0 z-40 border-r border-border bg-background px-3 py-2 text-xs font-medium">
              {t('assistantColumn')}
            </div>
            <div
              className="relative h-9 cursor-crosshair touch-none select-none"
              data-no-pan
              title={t('dataWindow')}
              onPointerDown={(event) => {
                if (event.button !== 0) return
                startPointer.current = event.clientX
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerUp={(event) => {
                const start = startPointer.current
                startPointer.current = null
                if (start === null || Math.abs(event.clientX - start) < 16) return
                const bounds = event.currentTarget.getBoundingClientRect()
                const at = (x: number) => from + Math.max(0, Math.min(1, (x - bounds.left) / bounds.width)) * span
                changeRange(
                  Math.round(at(Math.min(start, event.clientX))),
                  Math.round(at(Math.max(start, event.clientX)))
                )
              }}
              onPointerCancel={() => {
                startPointer.current = null
              }}
            >
              {view.ticks.map((tick) => (
                <span
                  key={tick}
                  title={date(tick, view.timeZone)}
                  className="absolute top-2 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                  style={{ left: `${position(tick, view)}%` }}
                >
                  {tickLabel(tick)}
                </span>
              ))}
            </div>
          </div>
        </div>
        {data.assistants.map((assistant) => {
          const key = assistant.id ?? 'unknown',
            name = assistant.name || t('unknownAssistant'),
            isExpanded = expanded.has(key)
          return (
            <section key={key} aria-label={name}>
              <div className="grid grid-cols-[288px_minmax(0,1fr)] border-b border-border bg-muted/40">
                <div className="sticky left-0 z-20 flex h-[60px] items-center gap-1 border-r border-border bg-muted px-1 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={t(isExpanded ? 'collapse' : 'expand', { name })}
                    aria-expanded={isExpanded}
                    onClick={() => {
                      const next = new Set(expanded)
                      if (isExpanded) next.delete(key)
                      else next.add(key)
                      setExpanded(next)
                    }}
                  >
                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                  </Button>
                  <AssistantAvatar avatar={assistant.avatar} name={name} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold"
                      title={`${name} · ${assistant.workspaceName || t('unknownWorkspace')}`}
                    >
                      {name}
                    </p>
                    <p
                      className="truncate text-xs tabular-nums text-muted-foreground"
                      title={`${assistant.workspaceName || t('unknownWorkspace')} · ${t('records', { count: assistant.total })}`}
                    >
                      {t('records', { count: assistant.total })} · {t('running')} {assistant.running}
                      {assistant.failed > 0 && (
                        <span className="ml-2 text-destructive">
                          {t('error')} {assistant.failed}
                        </span>
                      )}
                    </p>
                  </div>
                  {assistant.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={t('onlyAssistant')}
                      title={t('onlyAssistant')}
                      onClick={() => focus(assistant.id!)}
                    >
                      <Focus className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="relative h-[60px]" data-testid="assistant-track">
                  <SummaryTrack
                    view={view}
                    name={name}
                    overlap={assistant.overlap}
                    failures={assistant.failures}
                    truncated={assistant.failureMarkersTruncated}
                    open={open}
                    select={(range) => segment(assistant.id, range)}
                  />
                  {(assistant.pending > 0 || assistant.interrupted > 0) && (
                    <p className="absolute bottom-0 left-2 text-xs text-muted-foreground">
                      {t('pending')} {assistant.pending} · {t('interrupted')} {assistant.interrupted}
                    </p>
                  )}
                </div>
              </div>
              <ConversationLoader query={data.query} assistantId={assistant.id} expanded={isExpanded} queued={queued}>
                {(items) =>
                  items.map((item) => {
                    const conversationKey = `${key}/${item.key}`
                    return (
                      <ConversationRows
                        key={item.key}
                        item={item}
                        query={{
                          ...data.query,
                          assistantId: assistant.id ?? undefined,
                          unknownAssistantOnly: assistant.id === null || undefined
                        }}
                        view={view}
                        queued={queued}
                        open={open}
                        expanded={expandedConversations.has(conversationKey)}
                        toggle={() => {
                          const next = new Set(expandedConversations)
                          if (next.has(conversationKey)) next.delete(conversationKey)
                          else next.add(conversationKey)
                          setExpandedConversations(next)
                        }}
                      />
                    )
                  })
                }
              </ConversationLoader>
            </section>
          )
        })}
      </div>
    </div>
  )
}
