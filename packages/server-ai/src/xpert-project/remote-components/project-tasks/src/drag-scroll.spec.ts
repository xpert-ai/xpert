/** @jest-environment jsdom */
import { attachDragScroll } from './drag-scroll'

describe('task content drag scrolling', () => {
    let viewport: HTMLDivElement, button: HTMLButtonElement, cleanup: () => void
    const pointer = (target: EventTarget, type: string, x: number, y: number, pointerType = 'mouse') => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
        Object.defineProperties(event, {
            pointerId: { value: 1 },
            pointerType: { value: pointerType },
            isPrimary: { value: true }
        })
        target.dispatchEvent(event)
    }
    beforeEach(() => {
        viewport = document.createElement('div')
        button = document.createElement('button')
        viewport.append(button)
        document.body.append(viewport)
        Object.defineProperties(viewport, { clientWidth: { value: 600 }, clientHeight: { value: 400 } })
        viewport.setPointerCapture = jest.fn()
        viewport.hasPointerCapture = jest.fn(() => false)
        viewport.releasePointerCapture = jest.fn()
        cleanup = attachDragScroll(viewport)
    })
    afterEach(() => {
        cleanup()
        viewport.remove()
    })
    it('pans both axes and suppresses the release click on a task', () => {
        const open = jest.fn()
        button.addEventListener('click', open)
        pointer(button, 'pointerdown', 200, 200)
        pointer(document, 'pointermove', 100, 140)
        expect(viewport.scrollLeft).toBe(100)
        expect(viewport.scrollTop).toBe(60)
        expect(viewport.dataset.panning).toBe('true')
        pointer(document, 'pointerup', 100, 140)
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        expect(open).not.toHaveBeenCalled()
        expect(viewport.dataset.panning).toBeUndefined()
    })
    it('retains short clicks and keyboard activation', () => {
        const open = jest.fn()
        button.addEventListener('click', open)
        pointer(button, 'pointerdown', 200, 200)
        pointer(document, 'pointermove', 202, 200)
        pointer(document, 'pointerup', 202, 200)
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        button.click()
        expect(open).toHaveBeenCalledTimes(2)
        expect(viewport.scrollLeft).toBe(0)
    })
    it('leaves resize handles, form controls and touch scrolling alone', () => {
        const input = document.createElement('input'),
            handle = document.createElement('div')
        handle.setAttribute('role', 'separator')
        viewport.append(input, handle)
        for (const target of [input, handle]) {
            pointer(target, 'pointerdown', 200, 200)
            pointer(document, 'pointermove', 100, 100)
            pointer(document, 'pointerup', 100, 100)
        }
        pointer(button, 'pointerdown', 200, 200, 'touch')
        pointer(document, 'pointermove', 100, 100, 'touch')
        expect(viewport.scrollLeft).toBe(0)
        expect(viewport.setPointerCapture).not.toHaveBeenCalled()
    })
    it('cleans up a cancelled or unmounted drag', () => {
        pointer(button, 'pointerdown', 200, 200)
        pointer(document, 'pointermove', 150, 150)
        pointer(document, 'pointercancel', 150, 150)
        pointer(document, 'pointermove', 100, 100)
        expect(viewport.scrollLeft).toBe(50)
        expect(viewport.dataset.panning).toBeUndefined()
        cleanup()
        pointer(button, 'pointerdown', 200, 200)
        pointer(document, 'pointermove', 100, 100)
        expect(viewport.scrollLeft).toBe(50)
    })
    function nestedViewport() {
        cleanup()
        const lane = document.createElement('section')
        lane.dataset.scrollPanY = ''
        Object.defineProperties(lane, { clientWidth: { value: 300 }, clientHeight: { value: 400 } })
        viewport.append(lane)
        lane.append(button)
        cleanup = attachDragScroll(viewport, { verticalSelector: '[data-scroll-pan-y]' })
        return lane
    }
    it('pans the board horizontally and only the starting lane vertically', () => {
        const lane = nestedViewport()
        const otherLane = document.createElement('section')
        otherLane.dataset.scrollPanY = ''
        viewport.append(otherLane)
        viewport.scrollLeft = 30
        viewport.scrollTop = 10
        lane.scrollTop = 20
        otherLane.scrollTop = 40
        const open = jest.fn()
        button.addEventListener('click', open)

        pointer(button, 'pointerdown', 200, 200)
        pointer(otherLane, 'pointermove', 140, 120)
        expect(viewport.scrollLeft).toBe(90)
        expect(lane.scrollTop).toBe(100)
        expect(viewport.scrollTop).toBe(10)
        expect(otherLane.scrollTop).toBe(40)
        expect(button.parentElement).toBe(lane)
        pointer(document, 'pointerup', 140, 120)
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        expect(open).not.toHaveBeenCalled()
    })
    it('preserves normal clicks after a nested pan and cancels native card dragging', () => {
        nestedViewport()
        const open = jest.fn()
        button.addEventListener('click', open)
        pointer(button, 'pointerdown', 200, 200)
        const native = new Event('dragstart', { bubbles: true, cancelable: true })
        button.dispatchEvent(native)
        expect(native.defaultPrevented).toBe(true)
        pointer(document, 'pointermove', 140, 120)
        pointer(document, 'pointerup', 140, 120)
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        pointer(button, 'pointerdown', 200, 200)
        pointer(document, 'pointerup', 200, 200)
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
        expect(open).toHaveBeenCalledTimes(1)
    })
    it('leaves a nested scrollbar and touch gestures to the browser', () => {
        const lane = nestedViewport()
        pointer(lane, 'pointerdown', 305, 200)
        pointer(document, 'pointermove', 200, 100)
        pointer(document, 'pointerup', 200, 100)
        pointer(button, 'pointerdown', 200, 200, 'touch')
        pointer(document, 'pointermove', 100, 100, 'touch')
        expect(viewport.scrollLeft).toBe(0)
        expect(lane.scrollTop).toBe(0)
        expect(viewport.setPointerCapture).not.toHaveBeenCalled()
    })
})
