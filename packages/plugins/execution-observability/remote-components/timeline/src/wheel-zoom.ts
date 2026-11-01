import { TIME_SCALES } from './timeline-layout'

/** Normalize wheel modes and bound high-frequency trackpad/notched-wheel gestures. */
export function createWheelZoomGesture() {
  let accumulated = 0,
    previousTime = -Infinity,
    previousStep = -Infinity
  return (scale: number, deltaY: number, deltaMode: number, now: number, pageHeight: number) => {
    const delta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1)
    if (!Number.isFinite(delta) || delta === 0) return scale
    if (now - previousTime > 180 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0
    previousTime = now
    accumulated += delta
    if (Math.abs(accumulated) < 40 || now - previousStep < 120) return scale
    const index = TIME_SCALES.indexOf(scale),
      direction = accumulated < 0 ? 1 : -1
    accumulated = 0
    previousStep = now
    return TIME_SCALES[Math.max(0, Math.min(TIME_SCALES.length - 1, index + direction))]
  }
}
