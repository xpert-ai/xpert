/** @jest-environment jsdom */
import React, { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { PipelineViewport } from './viewport'
import { pipelineTexts } from './i18n'
import { saveTaskViewState } from '../bridge'

jest.mock('@xpert-ai/shadcn-ui', () => ({
    ...jest.requireActual('@/components/ui/button'),
    ...jest.requireActual('@/components/ui/separator')
}))

jest.mock('../bridge', () => ({ saveTaskViewState: jest.fn() }))

it('preserves the viewed center, fits both dimensions on resize, and restores the saved scale', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const previousObserver = global.ResizeObserver
    let resize: () => void = () => undefined
    global.ResizeObserver = class {
        constructor(callback: ResizeObserverCallback) {
            resize = () => callback([], this)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    const container = document.createElement('div'),
        root = createRoot(container),
        viewport = createRef<HTMLDivElement>()
    const select = jest.fn()
    try {
        await act(async () =>
            root.render(
                <PipelineViewport
                    viewport={viewport}
                    width={2000}
                    height={1000}
                    t={pipelineTexts('zh')}
                    initialScroll={{ pipelineScale: 0.5, scrollLeft: 200, scrollTop: 100 }}
                >
                    <button onClick={select}>Node</button>
                </PipelineViewport>
            )
        )
        const element = viewport.current!
        let width = 816,
            height = 416
        Object.defineProperties(element, { clientWidth: { get: () => width }, clientHeight: { get: () => height } })
        const button = (label: string) =>
            [...container.querySelectorAll('button')].find(
                (item) => item.getAttribute('aria-label') === label || item.textContent === label
            )!
        expect(button('恢复 100%').textContent).toBe('50%')
        expect(element.scrollLeft).toBe(200)
        await act(async () => button('放大').click())
        expect(button('恢复 100%').textContent).toBe('60%')
        expect(element.scrollLeft).toBeCloseTo((200 + width / 2) * 1.2 - width / 2)
        await act(async () => button('适应全图').click())
        expect(button('恢复 100%').textContent).toBe('40%')
        expect(element.scrollLeft).toBe(0)
        expect(element.scrollTop).toBe(0)
        height = 216
        await act(async () => resize())
        expect(button('恢复 100%').textContent).toBe('20%')
        await act(async () => button('Node').click())
        expect(select).toHaveBeenCalledTimes(1)
        await act(async () => button('恢复 100%').click())
        expect(button('恢复 100%').textContent).toBe('100%')
        expect(button('适应全图').getAttribute('aria-pressed')).toBe('false')
        expect(saveTaskViewState).toHaveBeenLastCalledWith(expect.objectContaining({ pipelineScale: 1 }))
    } finally {
        await act(async () => root.unmount())
        global.ResizeObserver = previousObserver
        errors.mockRestore()
    }
})
