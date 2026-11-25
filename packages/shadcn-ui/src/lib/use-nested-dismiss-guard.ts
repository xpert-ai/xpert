import * as React from 'react'

type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>

// Radix Dialog defers outside dismissal until click. A child layer can disappear
// on pointerdown, so preserve the parent's eligibility before that child closes.
export function useNestedDismissGuard(forwardedRef: React.ForwardedRef<HTMLDivElement>) {
  const [content, setContent] = React.useState<HTMLDivElement | null>(null)
  const blocked = React.useRef(new WeakSet<PointerEvent>())
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      setContent(node)
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef]
  )

  React.useEffect(() => {
    if (!content) return
    const document = content.ownerDocument
    const capture = (event: PointerEvent) => {
      if (document.defaultView?.getComputedStyle(content).pointerEvents === 'none') blocked.current.add(event)
    }
    document.addEventListener('pointerdown', capture, true)
    return () => document.removeEventListener('pointerdown', capture, true)
  }, [content])

  return {
    ref,
    onPointerDownOutside(event: PointerDownOutsideEvent) {
      if (blocked.current.has(event.detail.originalEvent)) event.preventDefault()
    }
  }
}
