import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@xpert-ai/shadcn-ui'
import type { ExecutionObservationOverview } from '@xpert-ai/contracts'
import { useI18n } from './i18n'
import { position, type TimelineViewport } from './timeline-layout'
import { overlapCountAt, trendTimeAtPixel } from './trend-layout'

/** Shares the timeline canvas, so its plot, ruler and records pan and zoom together. */
export function OverlapOverview({ data, view }: { data: ExecutionObservationOverview; view: TimelineViewport }) {
  const { t, date } = useI18n()
  const [hover, setHover] = useState<number | null>(null)
  const segments = data.summary.overlap,
    peak = Math.max(1, data.summary.peakOverlap)
  const y = (count: number) => 56 - (count / peak) * 48
  const path = useMemo(() => {
    const x = (value: string) =>
      Math.max(0, Math.min(1000, ((Date.parse(value) - view.from) / (view.to - view.from)) * 1000))
    return [
      'M 0 56',
      ...segments.map((segment, index) => {
        const gap = index === 0 || Date.parse(segment.start) > Date.parse(segments[index - 1].end)
        return `${gap ? `V 56 H ${x(segment.start)}` : ''} V ${56 - (segment.count / peak) * 48} H ${x(segment.end)}`
      }),
      'V 56 H 1000'
    ].join(' ')
  }, [segments, peak, view.from, view.to])
  useEffect(() => setHover(null), [view.visibleFrom, view.visibleTo, segments])
  const count = hover === null ? 0 : overlapCountAt(segments, hover)
  const flip = hover !== null && hover > (view.visibleFrom + view.visibleTo) / 2
  return (
    <section
      aria-label={t('overlap')}
      className="grid grid-cols-[288px_minmax(0,1fr)] border-b border-border bg-background"
    >
      <div
        className="sticky left-0 z-40 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-r border-border bg-background px-3 py-1"
        title={`${date(view.from, view.timeZone)} — ${date(view.to, view.timeZone)}`}
      >
        <h2 className="text-xs font-medium">{t('overlap')}</h2>
        <Badge variant="secondary">{t('peak', { count: data.summary.peakOverlap })}</Badge>
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label={t('overlapInspect')}
        data-testid="overlap-plot"
        className="relative h-12 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onPointerMove={(event) => {
          if (event.buttons) return
          const bounds = event.currentTarget.getBoundingClientRect()
          setHover(trendTimeAtPixel(event.clientX - bounds.left, bounds.width, view.from, view.to))
        }}
        onPointerLeave={() => setHover(null)}
        onPointerDown={() => setHover(null)}
        onBlur={() => setHover(null)}
        onFocus={() => setHover((view.visibleFrom + view.visibleTo) / 2)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const step = ((view.to - view.from) / view.plotWidth) * 10,
            current = hover ?? (view.visibleFrom + view.visibleTo) / 2
          setHover(
            Math.max(
              view.visibleFrom,
              Math.min(
                view.visibleTo,
                event.key === 'Home'
                  ? view.visibleFrom
                  : event.key === 'End'
                    ? view.visibleTo
                    : current + (event.key === 'ArrowLeft' ? -step : step)
              )
            )
          )
        }}
      >
        <svg
          className="h-full w-full text-primary"
          viewBox="0 0 1000 64"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${t('overlap')} ${date(view.from, view.timeZone)}–${date(view.to, view.timeZone)}`}
        >
          <path d={`${path} H 0 Z`} fill="currentColor" fillOpacity="0.1" />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover !== null && (
          <>
            <div
              data-testid="overlap-cursor"
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/60"
              style={{ left: `${position(hover, view)}%` }}
            />
            <div
              className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
              style={{ left: `${position(hover, view)}%`, top: `${(y(count) / 64) * 100}%` }}
            />
            <div
              role="tooltip"
              className={`pointer-events-none absolute top-1 z-30 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs tabular-nums text-popover-foreground shadow-sm ${flip ? '-ml-2 -translate-x-full' : 'ml-2'}`}
              style={{ left: `${position(hover, view)}%` }}
            >
              <span>{date(hover, view.timeZone)}</span>
              <strong className="ml-2">{t('overlapCount', { count })}</strong>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
