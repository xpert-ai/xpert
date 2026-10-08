import { useLayoutEffect, type RefObject } from 'react'

/** Pan the viewport, never the task itself. A click still opens its original target. */
export function attachDragScroll(element: HTMLElement) {
    let drag: { pointer: number; x: number; y: number; left: number; top: number; active: boolean } | null = null
    let suppressClick = false
    const document = element.ownerDocument
    const finish = () => {
        const current = drag
        drag = null
        delete element.dataset.panning
        if (current && element.hasPointerCapture(current.pointer)) element.releasePointerCapture(current.pointer)
    }
    const down = (event: PointerEvent) => {
        if (event.button !== 0 || event.pointerType === 'touch' || !event.isPrimary) return
        if (!(event.target instanceof Element)) return
        if (
            event.target.closest(
                'input,textarea,select,[contenteditable="true"],[role="separator"],[role="slider"],[data-scroll-pan-ignore]'
            )
        )
            return
        // Leave native scrollbar interaction alone.
        const bounds = element.getBoundingClientRect()
        if (event.clientX >= bounds.left + element.clientWidth || event.clientY >= bounds.top + element.clientHeight)
            return
        suppressClick = false
        drag = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
            active: false
        }
    }
    const move = (event: PointerEvent) => {
        if (!drag || drag.pointer !== event.pointerId) return
        const dx = event.clientX - drag.x,
            dy = event.clientY - drag.y
        if (!drag.active && Math.hypot(dx, dy) < 5) return
        if (!drag.active) {
            drag.active = true
            suppressClick = true
            element.dataset.panning = 'true'
            element.setPointerCapture(event.pointerId)
            document.getSelection()?.removeAllRanges()
        }
        event.preventDefault()
        element.scrollLeft = drag.left - dx
        element.scrollTop = drag.top - dy
    }
    const up = (event: PointerEvent) => {
        if (drag?.pointer === event.pointerId) finish()
    }
    const click = (event: MouseEvent) => {
        if (!suppressClick || event.detail === 0) return
        suppressClick = false
        event.preventDefault()
        event.stopImmediatePropagation()
    }
    const nativeDrag = (event: DragEvent) => {
        if (drag) event.preventDefault()
    }
    element.addEventListener('pointerdown', down)
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    element.addEventListener('lostpointercapture', up)
    element.addEventListener('click', click, true)
    element.addEventListener('dragstart', nativeDrag)
    return () => {
        finish()
        element.removeEventListener('pointerdown', down)
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', up)
        element.removeEventListener('lostpointercapture', up)
        element.removeEventListener('click', click, true)
        element.removeEventListener('dragstart', nativeDrag)
    }
}

export function useDragScroll(ref: RefObject<HTMLDivElement>) {
    useLayoutEffect(() => {
        if (ref.current) return attachDragScroll(ref.current)
    }, [ref])
}
