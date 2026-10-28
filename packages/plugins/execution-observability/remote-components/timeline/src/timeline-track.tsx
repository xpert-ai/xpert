import { Button } from '@xpert-ai/shadcn-ui'
import { CircleHelp, CircleX } from 'lucide-react'
import type { ExecutionObservationRecord, ExecutionObservationSegment } from '@xpert-ai/contracts'
import { useI18n } from './i18n'
import { executionKind, inViewport, packExecutions, position, type TimelineViewport } from './timeline-layout'
import { statusClass } from './timeline-status'

export function TimeGrid({ view }: { view: TimelineViewport }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {view.ticks.map((tick) => (
        <span
          key={tick}
          className="absolute inset-y-0 border-l border-dashed border-border/70"
          style={{ left: `${position(tick, view)}%` }}
        />
      ))}
      {view.asOf >= view.from && view.asOf <= view.to && (
        <span
          className="absolute inset-y-0 z-10 border-l border-dashed border-primary"
          style={{ left: `${position(view.asOf, view)}%` }}
        />
      )}
    </div>
  )
}
export function SummaryTrack({
  view,
  name,
  overlap,
  failures,
  open,
  select,
  truncated = false
}: {
  view: TimelineViewport
  name: string
  overlap: ExecutionObservationSegment[]
  failures: Array<{ id: string; completedAt: string }>
  open: (id: string) => void
  select: (range: ExecutionObservationSegment) => void
  truncated?: boolean
}) {
  const { t, time } = useI18n()
  return (
    <>
      <TimeGrid view={view} />
      {failures
        .filter((record) => inViewport(Date.parse(record.completedAt), Date.parse(record.completedAt), view))
        .map((record) => (
          <Button
            key={record.id}
            variant="ghost"
            size="icon"
            onClick={() => open(record.id)}
            aria-label={`${t('failureMarker')}: ${time(record.completedAt, view.timeZone)}`}
            title={`${t('failureMarker')} · ${time(record.completedAt, view.timeZone)}${truncated ? ` · ${t('recentFailures')}` : ''}`}
            className="absolute top-0 size-5 -translate-x-1/2 rounded-full text-destructive"
            style={{ left: `${position(Date.parse(record.completedAt), view)}%` }}
          >
            <CircleX className="size-3" />
          </Button>
        ))}
      {overlap
        .filter((range) => inViewport(Date.parse(range.start), Date.parse(range.end), view))
        .map((range) => {
          const left = position(Date.parse(range.start), view),
            width = position(Date.parse(range.end), view) - left
          return (
            <Button
              key={range.start}
              variant="outline"
              aria-label={`${name}: ${t('aggregate', { count: range.count })}, ${time(range.start, view.timeZone)}–${time(range.end, view.timeZone)}`}
              title={t('aggregate', { count: range.count })}
              onClick={() => select(range)}
              className={`absolute top-5 h-6 overflow-hidden rounded-sm border-primary/30 px-0 text-xs tabular-nums ${range.count > 1 ? 'bg-primary/30 dark:bg-primary/30' : 'bg-primary/10 dark:bg-primary/10'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {(width * view.plotWidth) / 100 > 18 ? range.count : null}
            </Button>
          )
        })}
    </>
  )
}
export function ExecutionTrack({
  records,
  view,
  open
}: {
  records: ExecutionObservationRecord[]
  view: TimelineViewport
  open: (id: string) => void
}) {
  const { t, time } = useI18n(),
    items = packExecutions(records, view),
    lanes = Math.max(1, ...items.map((item) => item.lane + 1))
  return (
    <div className="relative min-h-[52px]" data-testid="thread-track" style={{ height: lanes * 44 + 8 }}>
      <TimeGrid view={view} />
      {items
        .filter(({ record, interval }) =>
          inViewport(
            interval?.start ?? Date.parse(record.createdAt),
            interval?.end ?? Date.parse(record.createdAt),
            view
          )
        )
        .map(({ record, interval, lane }) => {
          const left = position(interval?.start ?? Date.parse(record.createdAt), view),
            width = interval ? position(interval.end, view) - left : 0
          const labelInset = interval
            ? Math.max(0, ((view.visibleFrom - interval.start) / (view.to - view.from)) * view.plotWidth)
            : 0
          const point = !interval || width <= 0,
            label = `${t(executionKind(record))} · ${record.title || t('unknownTitle')}`,
            pixels = (width * view.plotWidth) / 100
          return (
            <Button
              key={record.id}
              variant="outline"
              onClick={() => open(record.id)}
              title={`${label} · ${t(record.status)} · ${time(record.createdAt, view.timeZone)}–${record.completedAt ? time(record.completedAt, view.timeZone) : record.status === 'running' ? time(view.asOf, view.timeZone) : t('unknownEnd')}`}
              aria-label={`${label} · ${t(record.status)}`}
              className={`absolute gap-0 overflow-hidden text-left ${point ? 'size-6 -translate-x-1/2 rounded-full p-0' : 'h-10 min-w-1 flex-col items-start rounded-sm px-0 py-1'} ${statusClass[record.status]}`}
              style={{ left: `${left}%`, width: point ? undefined : `${width}%`, top: lane * 44 + (point ? 14 : 4) }}
            >
              {point ? (
                <CircleHelp className="size-4" />
              ) : pixels > 96 ? (
                <div
                  className="flex min-w-0 flex-col px-2"
                  style={{ marginLeft: labelInset, width: Math.max(0, pixels - labelInset) }}
                >
                  <span className="w-full truncate text-xs font-medium leading-3.5">{label}</span>
                  <span className="w-full truncate text-xs leading-3.5 opacity-75">
                    {t(record.status)} · {time(record.createdAt, view.timeZone)}–
                    {record.completedAt ? time(record.completedAt, view.timeZone) : time(view.asOf, view.timeZone)}
                  </span>
                </div>
              ) : null}
            </Button>
          )
        })}
    </div>
  )
}
