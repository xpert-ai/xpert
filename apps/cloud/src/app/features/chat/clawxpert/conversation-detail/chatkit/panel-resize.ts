import { CLAWXPERT_CHATKIT_MIN_WIDTH_PX, clampChatkitWidth } from './layout'

export function startChatkitPanelResize(
  event: PointerEvent,
  startWidth: number,
  callbacks: {
    onWidth: (width: number) => void
    onEnd: () => void
    onMaximize: () => void
  }
): () => void {
  const startX = event.clientX
  const pointerId = event.pointerId
  const target = event.currentTarget
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  let ended = false

  if (target instanceof HTMLElement && typeof target.setPointerCapture === 'function') {
    target.setPointerCapture(pointerId)
  }

  const cleanup = () => {
    if (ended) return
    ended = true
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerEnd)
    window.removeEventListener('pointercancel', handlePointerEnd)
    window.removeEventListener('blur', cleanup)
    if (target instanceof HTMLElement) {
      target.removeEventListener('lostpointercapture', handlePointerEnd)
      if (target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId)
      }
    }
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
    callbacks.onEnd()
  }

  const handlePointerMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pointerId) return
    moveEvent.preventDefault()
    const width = startWidth + startX - moveEvent.clientX
    callbacks.onWidth(clampChatkitWidth(width))

    // Keep the unclamped width to measure travel beyond the minimum-width border.
    if (CLAWXPERT_CHATKIT_MIN_WIDTH_PX - width > CLAWXPERT_CHATKIT_MIN_WIDTH_PX / 2) {
      cleanup()
      callbacks.onMaximize()
    }
  }

  const handlePointerEnd = (endEvent: PointerEvent) => {
    if (endEvent.pointerId === pointerId) cleanup()
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerEnd)
  window.addEventListener('pointercancel', handlePointerEnd)
  window.addEventListener('blur', cleanup)
  if (target instanceof HTMLElement) {
    target.addEventListener('lostpointercapture', handlePointerEnd)
  }

  return cleanup
}
