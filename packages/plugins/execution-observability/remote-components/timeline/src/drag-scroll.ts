import { useRef, useState, type PointerEvent, type DragEvent, type MouseEvent } from 'react'

export function useDragScroll() {
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    suppressClick.current = current.moved
    gesture.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return {
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        // Touch/pen retain native scrolling. The ruler keeps its range-selection gesture.
        if (
          event.pointerType !== 'mouse' ||
          event.button !== 0 ||
          !(event.target instanceof Element) ||
          event.target.closest('[data-no-pan], input, select, textarea, a')
        )
          return
        suppressClick.current = false
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: event.currentTarget.scrollLeft,
          top: event.currentTarget.scrollTop,
          moved: false
        }
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = gesture.current
        if (!current || current.id !== event.pointerId) return
        if (!event.buttons) {
          finish(event)
          return
        }
        const dx = event.clientX - current.x,
          dy = event.clientY - current.y
        if (!current.moved && Math.hypot(dx, dy) < 5) return
        if (!current.moved) {
          current.moved = true
          setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        event.preventDefault()
        event.currentTarget.scrollLeft = current.left - dx
        event.currentTarget.scrollTop = current.top - dy
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault()
          event.stopPropagation()
          suppressClick.current = false
        }
      },
      onDragStart: (event: DragEvent<HTMLDivElement>) => event.preventDefault()
    }
  }
}
