import { overlapCountAt, trendTimeAtPixel } from '../remote-components/timeline/src/trend-layout'
import { makeViewport, plotWidth, position } from '../remote-components/timeline/src/timeline-layout'

describe('shared timeline trend coordinates and counts', () => {
  const from = Date.parse('2026-10-26T10:00:00Z'),
    to = from + 3600000
  const segments = [
    { start: new Date(from).toISOString(), end: new Date(from + 600000).toISOString(), count: 2 },
    { start: new Date(from + 600000).toISOString(), end: new Date(from + 1200000).toISOString(), count: 5 },
    { start: new Date(from + 1800000).toISOString(), end: new Date(from + 2400000).toISOString(), count: 1 }
  ]
  it('counts half-open boundaries and idle gaps without extending completed records', () => {
    expect(overlapCountAt(segments, from - 1)).toBe(0)
    expect(overlapCountAt(segments, from)).toBe(2)
    expect(overlapCountAt(segments, from + 600000)).toBe(5)
    expect(overlapCountAt(segments, from + 1200000)).toBe(0)
    expect(overlapCountAt(segments, from + 1800000)).toBe(1)
    expect(overlapCountAt(segments, to)).toBe(0)
    expect(overlapCountAt([], from)).toBe(0)
  })
  it('uses the same timestamp as task bars at every zoom and scroll position', () => {
    for (const scale of [1, 2, 8, 64]) {
      const width = plotWidth(1400, scale),
        scrollLeft = scale === 1 ? 0 : width / 3
      const view = makeViewport(from, to, to, width, scrollLeft, 1400, 'UTC')
      const time = trendTimeAtPixel(scrollLeft + 200, width, from, to)
      expect((position(time, view) / 100) * width - scrollLeft).toBeCloseTo(200, 4)
    }
  })
  it('clamps hover to the query interval at canvas edges', () => {
    expect(trendTimeAtPixel(-10, 1000, from, to)).toBe(from)
    expect(trendTimeAtPixel(1010, 1000, from, to)).toBe(to)
  })
})
