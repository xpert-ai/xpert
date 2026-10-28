import type { ExecutionObservationRecord } from '@xpert-ai/contracts'

export const TIME_SCALES = [1, 2, 4, 8, 16, 32, 64]
export const LABEL_WIDTH = 288,
  SCROLL_GUTTER = 16
export function plotWidth(viewportWidth: number, scale: number) {
  return (Math.max(560, viewportWidth) - LABEL_WIDTH - SCROLL_GUTTER) * scale
}
export function anchoredScroll(
  left: number,
  oldWidth: number,
  newWidth: number,
  viewportWidth: number,
  oldViewportWidth = viewportWidth
) {
  const visible = Math.max(1, viewportWidth - LABEL_WIDTH - SCROLL_GUTTER),
    oldVisible = Math.max(1, oldViewportWidth - LABEL_WIDTH - SCROLL_GUTTER)
  return Math.max(0, Math.min(newWidth - visible, ((left + oldVisible / 2) / oldWidth) * newWidth - visible / 2))
}
export function pointerAnchoredScroll(
  left: number,
  oldWidth: number,
  newWidth: number,
  viewportWidth: number,
  offset: number
) {
  const visible = Math.max(1, viewportWidth - LABEL_WIDTH - SCROLL_GUTTER)
  return Math.max(0, Math.min(newWidth - visible, ((left + offset) / oldWidth) * newWidth - offset))
}
export type TimelineViewport = {
  from: number
  to: number
  asOf: number
  plotWidth: number
  visibleFrom: number
  visibleTo: number
  timeZone: string
  ticks: number[]
  step: number
}
export function makeViewport(
  from: number,
  to: number,
  asOf: number,
  width: number,
  left: number,
  viewportWidth: number,
  timeZone: string
): TimelineViewport {
  const span = to - from,
    visible = Math.max(1, viewportWidth - LABEL_WIDTH - SCROLL_GUTTER)
  const visibleFrom = Math.max(from, from + (left / width) * span),
    visibleTo = Math.min(to, from + ((left + visible) / width) * span)
  const step =
    [
      1000, 5000, 15000, 30000, 60000, 300000, 600000, 1800000, 3600000, 10800000, 21600000, 43200000, 86400000,
      259200000, 604800000
    ].find((value) => (value / span) * width >= 136) ?? 604800000
  const start = Math.max(Math.ceil(from / step) * step, Math.floor(visibleFrom / step) * step)
  const ticks = Array.from(
    { length: Math.max(0, Math.floor((Math.min(to, visibleTo + step) - start) / step) + 1) },
    (_, index) => start + index * step
  )
  return { from, to, asOf, plotWidth: width, visibleFrom, visibleTo, timeZone, ticks, step }
}
export const position = (time: number, view: TimelineViewport) =>
  Math.max(0, Math.min(100, ((time - view.from) / (view.to - view.from)) * 100))
export const inViewport = (start: number, end: number, view: TimelineViewport) =>
  end >= view.visibleFrom && start <= view.visibleTo
export function packExecutions(
  records: ExecutionObservationRecord[],
  view: Pick<TimelineViewport, 'from' | 'to' | 'asOf'>
) {
  const ends: number[] = []
  return [...records]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))
    .map((record) => {
      const rawStart = Date.parse(record.createdAt),
        rawEnd = record.completedAt ? Date.parse(record.completedAt) : record.status === 'running' ? view.asOf : null
      const interval =
        rawEnd !== null && rawEnd >= rawStart
          ? { start: Math.max(view.from, rawStart), end: Math.min(rawEnd, view.to, view.asOf) }
          : null
      const start = interval?.start ?? rawStart,
        end = interval?.end ?? start
      let lane = ends.findIndex((value) => value <= start)
      if (lane < 0) lane = ends.length
      ends[lane] = Math.max(end, start + 1)
      return { record, interval, lane }
    })
}
export function executionKind(record: Pick<ExecutionObservationRecord, 'parentId' | 'invocationKind'>) {
  return record.invocationKind === 'sub_agent'
    ? 'subAgent'
    : record.invocationKind === 'external_assistant'
      ? 'assistantCall'
      : record.parentId
        ? 'childExecution'
        : 'rootExecution'
}
export const shortId = (value: string) => (value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value)
