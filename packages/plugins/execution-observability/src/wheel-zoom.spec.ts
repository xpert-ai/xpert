import { pointerAnchoredScroll, plotWidth } from '../remote-components/timeline/src/timeline-layout'
import { createWheelZoomGesture } from '../remote-components/timeline/src/wheel-zoom'

describe('timeline wheel zoom', () => {
  it('keeps an off-center pointer on the same timestamp through zoom in and out', () => {
    const viewport = 1400,
      oldWidth = plotWidth(viewport, 4),
      nextWidth = plotWidth(viewport, 8)
    const left = 1700,
      pointer = 173
    const zoomed = pointerAnchoredScroll(left, oldWidth, nextWidth, viewport, pointer)
    expect((zoomed + pointer) / nextWidth).toBeCloseTo((left + pointer) / oldWidth, 12)
    expect(pointerAnchoredScroll(zoomed, nextWidth, oldWidth, viewport, pointer)).toBeCloseTo(left, 12)
    expect(pointerAnchoredScroll(0, nextWidth, plotWidth(viewport, 1), viewport, pointer)).toBe(0)
  })
  it('normalizes pixel, line and page wheels and respects both zoom limits', () => {
    for (const [delta, mode] of [
      [120, 0],
      [3, 1],
      [1, 2]
    ]) {
      const wheel = createWheelZoomGesture()
      expect(wheel(2, -delta, mode, 0, 600)).toBe(4)
      expect(wheel(4, delta, mode, 200, 600)).toBe(2)
      expect(wheel(1, delta, mode, 400, 600)).toBe(1)
      expect(wheel(64, -delta, mode, 600, 600)).toBe(64)
    }
  })
  it('accumulates small trackpad deltas without jumping through levels in a burst', () => {
    const wheel = createWheelZoomGesture()
    expect(wheel(1, -10, 0, 0, 600)).toBe(1)
    expect(wheel(1, -10, 0, 10, 600)).toBe(1)
    expect(wheel(1, -20, 0, 20, 600)).toBe(2)
    expect(wheel(2, -120, 0, 30, 600)).toBe(2)
    expect(wheel(2, -120, 0, 40, 600)).toBe(2)
    expect(wheel(2, -10, 0, 150, 600)).toBe(4)
    expect(wheel(4, 10, 0, 400, 600)).toBe(4)
    expect(wheel(4, -30, 0, 420, 600)).toBe(4)
    expect(wheel(4, -10, 0, 440, 600)).toBe(8)
  })
})
