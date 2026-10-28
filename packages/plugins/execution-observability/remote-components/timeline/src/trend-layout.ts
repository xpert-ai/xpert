import type { ExecutionObservationSegment } from '@xpert-ai/contracts'

export function trendTimeAtPixel(pixel: number, width: number, from: number, to: number) {
  return from + Math.max(0, Math.min(1, pixel / Math.max(1, width))) * (to - from)
}

/** Summary segments are ordered and half-open; gaps represent zero recorded overlap. */
export function overlapCountAt(segments: ExecutionObservationSegment[], timestamp: number) {
  let low = 0,
    high = segments.length - 1
  while (low <= high) {
    const index = Math.floor((low + high) / 2),
      segment = segments[index]
    if (timestamp < Date.parse(segment.start)) high = index - 1
    else if (timestamp >= Date.parse(segment.end)) low = index + 1
    else return segment.count
  }
  return 0
}
