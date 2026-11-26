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
const task = (id: string): Graph['tasks'][number] => ({
    id,
    title: id,
    status: 'done',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: null,
    plannedEndAt: null,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: null
})
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    read.mockReset()
    jest.useFakeTimers()
    setViewVisible(false)
})

it('retains loaded cards while the visible batch changes and replaces each refreshed history', async () => {
    let complete!: (data: unknown) => void
    const a = { ...item, id: 'a-1', taskId: 'a' }
    const b = { ...item, id: 'b-1', taskId: 'b' }
    read.mockResolvedValueOnce({ items: [a], next: null, version: 'v1' }).mockImplementation(
        () => new Promise((resolve) => (complete = resolve))
    )
    const container = document.createElement('div')
    const root = createRoot(container)
    const indexed = { ...graph, tasks: ['a', 'b'].map(task) }
    function Rows({ ids }: { ids: string[] }) {
        const result = useExecutionRows(indexed, ids, () => undefined)
        return (
            <span>
                {result.executions
                    .map((entry) => entry.id)
                    .sort()
                    .join(',')}
            </span>
        )
    }
    try {
        await act(async () => {
            setViewVisible(true)
            root.render(<Rows ids={['a']} />)
        })
        expect(container.textContent).toBe('a-1')
        await act(async () => root.render(<Rows ids={['a', 'b']} />))
        expect(container.textContent).toBe('a-1')
        await act(async () => complete({ items: [a, b], next: null, version: 'v2' }))
        expect(container.textContent).toBe('a-1,b-1')
        await act(async () => root.render(<Rows ids={['b']} />))
        expect(container.textContent).toBe('a-1,b-1')
        await act(async () => complete({ items: [], next: null, version: 'v3' }))
        expect(container.textContent).toBe('a-1')
        expect(read).toHaveBeenCalledTimes(3)
    } finally {
        await act(async () => root.unmount())
    }
})

it('clears rows and conditional versions on a project change and ignores the old response', async () => {
    let complete!: (data: unknown) => void
    read.mockResolvedValueOnce({ items: [item], next: null, version: 'v1' })
    const container = document.createElement('div')
    const root = createRoot(container)
    function Rows({ projectId, cursor }: { projectId: string; cursor: string }) {
        const result = useExecutionRows(
            { ...graph, projectId, cursor, tasks: [task('task')] },
            ['task'],
            () => undefined
        )
        return <span>{result.executions.map((entry) => entry.id).join(',')}</span>
    }
    try {
        await act(async () => {
            setViewVisible(true)
            root.render(<Rows projectId="first" cursor="1" />)
        })
        expect(container.textContent).toBe('attempt')
        read.mockImplementationOnce(() => new Promise((resolve) => (complete = resolve)))
        await act(async () => root.render(<Rows projectId="first" cursor="2" />))
        read.mockResolvedValueOnce({ items: [], next: null, version: 'second-version' })
        await act(async () => root.render(<Rows projectId="second" cursor="2" />))
        expect(container.textContent).toBe('')
        expect(read.mock.calls[2][1]).toMatchObject({ query: { parameters: { knownVersion: undefined } } })
        await act(async () => complete({ items: [item], next: null, version: 'old-version' }))
        expect(container.textContent).toBe('')
    } finally {
        await act(async () => root.unmount())
    }
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
