import { useEffect, useRef, useState } from 'react'
import { resizeSidebar, SIDEBAR_MIN, SIDEBAR_MAX } from './assistant-list-model'
import { t } from './i18n'

export function SidebarResizer({
  width,
  onChange,
  onCommit
}: {
  width: number
  onChange: (width: number, collapsed: boolean) => void
  onCommit: (width: number, collapsed: boolean) => void
}) {
  const [dragging, setDragging] = useState(false)
  const cleanup = useRef<() => void>(() => {})
  useEffect(() => () => cleanup.current(), [])
  return (
    <>
      {dragging && <div className="fixed inset-0 z-[80] cursor-col-resize select-none" aria-hidden="true" />}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t('Resize sidebar')}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        aria-valuenow={width}
        className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none outline-none hover:bg-primary/25 focus-visible:bg-primary/25"
        onDoubleClick={() => {
          onChange(320, false)
          onCommit(320, false)
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return
          event.preventDefault()
          const next =
            event.key === 'Home'
              ? SIDEBAR_MIN
              : event.key === 'End'
                ? SIDEBAR_MAX
                : width + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0)
          const value = resizeSidebar(next, window.innerWidth)
          const collapsed = event.key === 'Enter'
          onChange(value.width, collapsed)
          onCommit(value.width, collapsed)
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          cleanup.current()
          const origin = event.clientX
          const pointerId = event.pointerId
          const target = event.currentTarget
          const startingWidth = target.parentElement?.getBoundingClientRect().width ?? width
          let next = { width, collapsed: false }
          let finished = false
          target.setPointerCapture(pointerId)
          setDragging(true)
          const stop = () => {
            if (finished) return
            finished = true
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', cancel)
            window.removeEventListener('blur', cancel)
            if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
            setDragging(false)
            onCommit(next.width, next.collapsed)
          }
          const cancel = () => {
            next = { width, collapsed: false }
            onChange(width, false)
            stop()
          }
          const move = (move: PointerEvent) => {
            if (move.pointerId !== pointerId) return
            next = resizeSidebar(startingWidth + move.clientX - origin, window.innerWidth)
            onChange(next.width, next.collapsed)
            if (next.collapsed) stop()
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', stop)
          window.addEventListener('pointercancel', cancel)
          window.addEventListener('blur', cancel)
          cleanup.current = () => {
            finished = true
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            window.removeEventListener('pointercancel', cancel)
            window.removeEventListener('blur', cancel)
          }
        }}
      />
    </>
  )
}
