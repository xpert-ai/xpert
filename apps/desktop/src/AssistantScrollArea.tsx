import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import { t } from './i18n'
import { createPressScroller } from './press-scroll'

// The scroll viewport still supports wheel, trackpad and focus scrolling.
export function AssistantScrollArea({
  children,
  label,
  className = ''
}: {
  children: ReactNode
  label: string
  className?: string
}) {
  const id = useId()
  const viewport = useRef<HTMLElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [{ start, stop }] = useState(() => createPressScroller(() => viewport.current))
  const [edges, setEdges] = useState({ up: false, down: false })
  const measure = useCallback(() => {
    const node = viewport.current
    if (!node) return
    const up = node.scrollTop > 1
    const down = node.scrollTop + node.clientHeight < node.scrollHeight - 1
    setEdges((current) => (current.up === up && current.down === down ? current : { up, down }))
  }, [])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (viewport.current) observer.observe(viewport.current)
    if (content.current) observer.observe(content.current)
    measure()
    window.addEventListener('blur', stop)
    window.addEventListener('pointerup', stop)
    document.addEventListener('visibilitychange', stop)
    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('blur', stop)
      window.removeEventListener('pointerup', stop)
      document.removeEventListener('visibilitychange', stop)
    }
  }, [measure, stop])
  const arrow = (direction: -1 | 1) => {
    const enabled = direction === -1 ? edges.up : edges.down
    const Icon = direction === -1 ? ChevronUp : ChevronDown
    return (
      <Button
        size="icon"
        variant="ghost"
        disabled={!enabled}
        aria-label={t(direction === -1 ? 'Scroll assistants up' : 'Scroll assistants down')}
        aria-controls={id}
        className={`h-6 w-full shrink-0 touch-none rounded-none text-muted-foreground ${enabled ? '' : 'invisible'}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          start(direction)
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onBlur={stop}
        onKeyDown={(event) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          if (!event.repeat) start(direction)
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            stop()
          }
        }}
        onClick={(event) => {
          // Screen readers synthesize a click without a pointer/key press.
          if (event.detail === 0 && viewport.current) viewport.current.scrollTop += direction * 80
        }}
      >
        <Icon className="size-4" />
      </Button>
    )
  }
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {arrow(-1)}
      <nav
        id={id}
        ref={viewport}
        aria-label={label}
        onScroll={measure}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={content} className={className}>
          {children}
        </div>
      </nav>
      {arrow(1)}
    </div>
  )
}
