/** @jest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { z } from 'zod/v3'
import { executionObservationQuerySchema } from '@xpert-ai/contracts'
import { request } from '../remote-components/timeline/src/bridge'
import { useObservationPage } from '../remote-components/timeline/src/lazy-executions'
import { createReadQueue } from '../remote-components/timeline/src/read-queue'
import { useTimelineViewport } from '../remote-components/timeline/src/use-timeline-viewport'

jest.mock('../remote-components/timeline/src/bridge', () => ({ request: jest.fn() }))

const schema = z.object({ items: z.array(z.object({ id: z.string(), label: z.string() })) })
const initialQuery = executionObservationQuerySchema.parse({
  from: '2026-11-04T00:00:00Z',
  to: '2026-11-04T01:00:00Z',
  timeZone: 'UTC'
})
const refreshedQuery = {
  ...initialQuery,
  from: '2026-11-04T00:00:10Z',
  to: '2026-11-04T01:00:10Z',
  asOf: '2026-11-04T01:00:10Z'
}
const response = (label: string) => ({ item: { items: [{ id: 'same-record', label }] } })

describe('polling preserves mounted rows and user viewport', () => {
  let container: HTMLDivElement
  let root: Root
  let pending: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }>
  let current: ReturnType<typeof useObservationPage<z.infer<typeof schema>>>
  let queued: ReturnType<typeof createReadQueue>

  function Rows({ query = initialQuery, scope = 'original', expanded = true }) {
    current = useObservationPage(query, expanded, queued, schema, 'list', 25, scope)
    return createElement(
      'div',
      { 'data-failed': current.failed },
      current.data ? current.data.items.map((item) => createElement('button', { key: item.id }, item.label)) : 'loading'
    )
  }
  const render = async (props: Parameters<typeof Rows>[0] = {}) => {
    await act(async () => root.render(createElement(Rows, props)))
  }
  const resolve = async (label: string, index = pending.length - 1) => {
    await act(async () => pending[index].resolve(response(label)))
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    pending = []
    queued = createReadQueue(3)
    jest
      .mocked(request)
      .mockReset()
      .mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            pending.push({ resolve, reject })
          })
      )
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    jest.restoreAllMocks()
  })

  it('keeps the same focused DOM node while a poll is pending, then patches its text', async () => {
    await render()
    expect(container.textContent).toBe('loading')
    await resolve('running')
    const row = container.querySelector('button')!
    row.focus()
    await render({ query: refreshedQuery })
    expect(container.querySelector('button')).toBe(row)
    expect(container.textContent).toBe('running')
    await resolve('success')
    expect(container.querySelector('button')).toBe(row)
    expect(document.activeElement).toBe(row)
    expect(row.textContent).toBe('success')
  })

  it('keeps page two across polls but resets when the user changes filters', async () => {
    await render()
    await resolve('first page')
    await act(async () => current.setPage(2))
    expect(container.textContent).toBe('loading')
    await resolve('second page')
    await render({ query: refreshedQuery })
    expect(current.page).toBe(2)
    expect(container.textContent).toBe('second page')
    expect(request).toHaveBeenLastCalledWith(
      'requestData',
      expect.objectContaining({
        query: expect.objectContaining({ page: 2 })
      })
    )
    await resolve('second page refreshed')
    await render({ query: { ...refreshedQuery, search: 'another' }, scope: 'new filter' })
    expect(current.page).toBe(1)
    expect(container.textContent).toBe('loading')
    await resolve('filtered')
    expect(container.textContent).toBe('filtered')
  })

  it('keeps loaded rows after a refresh failure and during retry', async () => {
    await render()
    await resolve('loaded')
    const row = container.querySelector('button')
    await render({ query: refreshedQuery })
    await act(async () => pending[pending.length - 1].reject(Error('offline')))
    expect(current.failed).toBe(true)
    expect(container.querySelector('button')).toBe(row)
    await act(async () => current.retry())
    expect(container.querySelector('button')).toBe(row)
    await resolve('recovered')
    expect(current.failed).toBe(false)
    expect(container.textContent).toBe('recovered')
  })

  it('ignores an old response after a newer poll completes', async () => {
    await render()
    await resolve('initial')
    await render({ query: refreshedQuery })
    await render({ query: { ...refreshedQuery, asOf: '2026-11-04T01:00:20Z' } })
    await resolve('newest', 2)
    await resolve('outdated', 1)
    expect(container.textContent).toBe('newest')
  })

  it('invalidates cached rows on a new time range or lane identity', async () => {
    await render()
    await resolve('initial')
    await render({ query: refreshedQuery, scope: 'new range' })
    expect(container.textContent).toBe('loading')
    await resolve('new range')
    await render({ query: { ...refreshedQuery, conversationId: 'another-conversation' }, scope: 'new range' })
    expect(container.textContent).toBe('loading')
  })

  it('does not read collapsed lanes and reloads the latest snapshot on expansion', async () => {
    await render({ expanded: false })
    expect(request).not.toHaveBeenCalled()
    await render()
    await resolve('initial')
    await render({ expanded: false, query: refreshedQuery })
    expect(pending).toHaveLength(1)
    await render({ query: refreshedQuery })
    expect(pending).toHaveLength(2)
    expect(container.textContent).toBe('initial')
    await resolve('latest')
    expect(container.textContent).toBe('latest')
  })

  it('retains horizontal and vertical scroll on polling, resetting horizontal scroll for a new query', async () => {
    Object.assign(globalThis, {
      ResizeObserver: class {
        observe() {}
        disconnect() {}
      }
    })
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
    const onScaleChange = jest.fn()
    function Viewport({ from, scope }: { from: number; scope: string }) {
      const { ref } = useTimelineViewport(from, from + 3600000, from + 3600000, 4, 'UTC', onScaleChange, scope)
      return createElement('div', { ref })
    }
    await act(async () => root.render(createElement(Viewport, { from: 0, scope: 'original' })))
    const viewport = container.firstElementChild!
    viewport.scrollLeft = 350
    viewport.scrollTop = 180
    await act(async () => root.render(createElement(Viewport, { from: 10000, scope: 'original' })))
    expect(viewport.scrollLeft).toBe(350)
    expect(viewport.scrollTop).toBe(180)
    await act(async () => root.render(createElement(Viewport, { from: 20000, scope: 'new range' })))
    expect(viewport.scrollLeft).toBe(0)
  })
})
