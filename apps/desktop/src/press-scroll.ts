interface ScrollViewport {
  scrollTop: number
}
interface FrameClock {
  request: (callback: (time: number) => void) => number
  cancel: (id: number) => void
  now: () => number
}

export function createPressScroller(
  getViewport: () => ScrollViewport | null,
  clock: FrameClock = {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    now: () => performance.now()
  }
) {
  let frame = 0
  const stop = () => {
    clock.cancel(frame)
    frame = 0
  }
  const start = (direction: number) => {
    stop()
    const viewport = getViewport()
    if (!viewport) return
    viewport.scrollTop += direction * 40
    let last = clock.now()
    const tick = (now: number) => {
      const node = getViewport()
      if (!node) return stop()
      const previous = node.scrollTop
      node.scrollTop += direction * Math.min(now - last, 40) * 0.45
      last = now
      if (node.scrollTop === previous) return stop()
      frame = clock.request(tick)
    }
    frame = clock.request(tick)
  }
  return { start, stop }
}
