import { useEffect, useLayoutEffect, useRef, useState, type UIEvent } from 'react'
import {
  anchoredScroll,
  pointerAnchoredScroll,
  makeViewport,
  plotWidth,
  LABEL_WIDTH,
  SCROLL_GUTTER
} from './timeline-layout'
import { createWheelZoomGesture } from './wheel-zoom'

export function useTimelineViewport(
  from: number,
  to: number,
  asOf: number,
  scale: number,
  timeZone: string,
  onScaleChange: (scale: number) => void
) {
  const ref = useRef<HTMLDivElement>(null),
    previous = useRef<{ width: number; size: number; range: string } | null>(null)
  const frame = useRef<number | null>(null)
  const wheel = useRef(createWheelZoomGesture())
  const anchor = useRef<{ left: number; width: number; offset: number; scale: number } | null>(null)
  const [size, setSize] = useState(960),
    [left, setLeft] = useState(0)
  const width = plotWidth(size, scale),
    range = `${from}:${to}`
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    setSize(element.clientWidth)
    const observer = new ResizeObserver(() => setSize(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    if (previous.current) {
      element.scrollLeft =
        previous.current.range !== range
          ? 0
          : anchor.current?.scale === scale
            ? pointerAnchoredScroll(anchor.current.left, anchor.current.width, width, size, anchor.current.offset)
            : anchoredScroll(element.scrollLeft, previous.current.width, width, size, previous.current.size)
      setLeft(element.scrollLeft)
    }
    anchor.current = null
    previous.current = { width, size, range }
  }, [width, range, size, scale])
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const offset = event.clientX - element.getBoundingClientRect().left - element.clientLeft - LABEL_WIDTH
      // Keep list scrolling, horizontal gestures and Shift-wheel native. Ctrl-wheel also supports trackpad pinch.
      if (
        event.defaultPrevented ||
        event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.deltaY === 0 ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
        offset < 0 ||
        offset > element.clientWidth - LABEL_WIDTH - SCROLL_GUTTER
      )
        return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))
        return
      event.preventDefault()
      const next = wheel.current(scale, event.deltaY, event.deltaMode, performance.now(), element.clientHeight)
      if (next === scale) return
      anchor.current = { left: element.scrollLeft, width, offset, scale: next }
      onScaleChange(next)
    }
    // React wheel listeners are passive; native registration lets the canvas consume zoom gestures.
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [scale, width, onScaleChange])
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        setLeft(element.scrollLeft)
      })
  }
  return { ref, onScroll, viewport: makeViewport(from, to, asOf, width, left, size, timeZone) }
}
