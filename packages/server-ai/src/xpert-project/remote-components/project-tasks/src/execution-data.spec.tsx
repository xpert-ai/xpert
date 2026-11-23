/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ExecutionPageCache, useExecutionRows } from './execution-data'
import { request, type Graph } from './bridge'
import { setViewVisible } from './view-visibility'
jest.mock('@xpert-ai/shadcn-ui', () => ({ installShadcnThemeVars: jest.fn() }))
jest.mock('./bridge', () => ({ ...jest.requireActual('./bridge'), request: jest.fn() }))
const read = jest.mocked(request)
const graph: Graph = {
    progressive: true,
    projectId: 'project',
    cursor: 'version',
    tasks: [],
    executions: [],
    diagnostics: []
}
const item = { id: 'attempt', taskId: 'task', attempt: 1, status: 'running' }
beforeEach(() => {
    read.mockReset()
    jest.useFakeTimers()
    setViewVisible(false)
})
afterEach(() => {
    jest.useRealTimers()
})
it('conditionally validates cached pages without treating them as permission grants', async () => {
    const cache = new ExecutionPageCache()
    read.mockResolvedValueOnce({ items: [item], next: null, version: 'v1' }).mockResolvedValueOnce({
        notModified: true,
        version: 'v1'
    })
    expect((await cache.read(['task'])).items).toHaveLength(1)
    expect((await cache.read(['task'])).items).toHaveLength(1)
    expect(read.mock.calls[1][1]).toMatchObject({ query: { parameters: { knownVersion: 'v1', taskIds: ['task'] } } })
    read.mockRejectedValueOnce(Error('Revoked'))
    await expect(cache.read(['task'])).rejects.toThrow('Revoked')
})
it('loads visible task IDs, discards stale rows and stops fetching while hidden', async () => {
    let resolveOld!: (data: unknown) => void
    read.mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolveOld = resolve
            })
    ).mockResolvedValue({ items: [{ ...item, taskId: 'new' }], next: null, version: 'v2' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    function Rows({ id }: { id: string }) {
        const result = useExecutionRows(graph, [id], () => undefined)
        return <span>{result.executions.map((item) => item.taskId).join(',')}</span>
    }
    await act(async () => {
        setViewVisible(true)
        root.render(<Rows id="old" />)
    })
    await act(async () => {
        root.render(<Rows id="new" />)
    })
    expect(container.textContent).toBe('new')
    await act(async () => {
        resolveOld({ items: [{ ...item, taskId: 'old' }], next: null, version: 'v1' })
    })
    expect(container.textContent).toBe('new')
    await act(async () => {
        setViewVisible(false)
    })
    const count = read.mock.calls.length
    await act(async () => {
        jest.advanceTimersByTime(15000)
    })
    expect(read).toHaveBeenCalledTimes(count)
    await act(async () => {
        root.unmount()
    })
    container.remove()
})
