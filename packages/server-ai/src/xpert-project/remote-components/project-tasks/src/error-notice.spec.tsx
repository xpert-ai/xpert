/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ErrorNotice } from './error-notice'

// Keep the actual shared Toaster and Sonner DOM, without importing unrelated UI controls.
jest.mock('@xpert-ai/shadcn-ui', () => jest.requireActual('../../../../../../shadcn-ui/src/components/ui/sonner'))
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }))

let container: HTMLDivElement
let root: Root
const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
beforeAll(() => Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true }))
afterAll(() => {
    if (previousActEnvironment) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment)
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
})
beforeEach(() => {
    jest.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    jest.clearAllTimers()
    jest.useRealTimers()
    container.remove()
})

const props = { label: 'Project tasks', closeLabel: 'Close notification', retryLabel: 'Refresh' }
async function render(message: string | null, onRetry = jest.fn()) {
    await act(async () => root.render(<ErrorNotice {...props} message={message} onRetry={onRetry} />))
    await act(async () => jest.advanceTimersByTime(100))
}
async function finishDismissal() { await act(async () => jest.advanceTimersByTime(500)) }

it('preserves shared styling and localized controls, and retries with the latest callback', async () => {
    const first = jest.fn(), latest = jest.fn()
    await render('Failed to load tasks', first)
    const notice = container.querySelector('[data-sonner-toast]')
    expect(notice?.classList.contains('cn-toast')).toBe(true)
    expect(notice?.textContent).toContain('Failed to load tasks')
    expect(notice?.querySelector('[aria-label="Close notification"]')).not.toBeNull()
    await render('Failed to load tasks', latest)
    expect(container.querySelectorAll('[data-sonner-toast]')).toHaveLength(1)
    await act(async () => container.querySelector<HTMLButtonElement>('[data-button][data-action]')!.click())
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
})

it('keeps an identical dismissed error closed, but notifies again after recovery', async () => {
    await render('Temporary failure')
    await act(async () => container.querySelector<HTMLButtonElement>('[data-close-button]')!.click())
    await finishDismissal()
    await render('Temporary failure')
    expect(container.querySelector('[data-sonner-toast]')).toBeNull()
    await render(null)
    await render('Temporary failure')
    expect(container.querySelector('[data-sonner-toast]')?.textContent).toContain('Temporary failure')
    await render('Different failure')
    await finishDismissal()
    expect(container.querySelectorAll('[data-sonner-toast]')).toHaveLength(1)
    expect(container.querySelector('[data-sonner-toast]')?.textContent).toContain('Different failure')
})

it('cleans up on recovery and automatically closes without repeated polling alerts', async () => {
    await render('Failed once')
    await render(null)
    await finishDismissal()
    expect(container.querySelector('[data-sonner-toast]')).toBeNull()
    await render('Failed again')
    await act(async () => jest.advanceTimersByTime(6500))
    await finishDismissal()
    await render('Failed again')
    expect(container.querySelector('[data-sonner-toast]')).toBeNull()
})

it('isolates notifications between mounted task views', async () => {
    await act(async () => root.render(<>
        <section data-view="one"><ErrorNotice {...props} message="First view error" onRetry={jest.fn()} /></section>
        <section data-view="two"><ErrorNotice {...props} message="Second view error" onRetry={jest.fn()} /></section>
    </>))
    await act(async () => jest.advanceTimersByTime(100))
    const first = container.querySelector('[data-view="one"]')!, second = container.querySelector('[data-view="two"]')!
    expect(first.querySelector('[data-sonner-toast]')?.textContent).toContain('First view error')
    expect(second.querySelector('[data-sonner-toast]')?.textContent).toContain('Second view error')
    await act(async () => first.querySelector<HTMLButtonElement>('[data-close-button]')!.click())
    await finishDismissal()
    expect(first.querySelector('[data-sonner-toast]')).toBeNull()
    expect(second.querySelector('[data-sonner-toast]')).not.toBeNull()
})
