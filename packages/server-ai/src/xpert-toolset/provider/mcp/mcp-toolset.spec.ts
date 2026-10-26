import { MCPToolset } from './mcp-toolset'
import { XpertToolset } from '../../xpert-toolset.entity'

function fixture() {
    const toolset = new MCPToolset(Object.assign(new XpertToolset(), { id: 'fixture', name: 'fixture' }))
    const source = { onerror: jest.fn(), onmessage: jest.fn(), onopen: jest.fn(), close: jest.fn() }
    const abort = jest.fn(),
        destroy = jest.fn(async () => undefined),
        close = jest.fn(async () => undefined)
    const transport = { _eventSource: source, _abortController: { abort }, _endpoint: '/events' }
    Reflect.set(toolset, 'client', { close, _transportInstances: { fixture: transport } })
    Reflect.set(toolset, 'destroy', destroy)
    return { toolset, source, transport, abort, destroy, close }
}

describe('MCPToolset transport settlement', () => {
    it('closes an idle transport once and removes its EventSource callbacks', async () => {
        const f = fixture()
        await f.toolset.close()
        await f.toolset.close()
        expect(f.close).toHaveBeenCalledTimes(1)
        expect(f.destroy).toHaveBeenCalledTimes(1)
        expect(f.source.onerror).toBeNull()
        expect(f.source.onmessage).toBeNull()
        expect(f.source.onopen).toBeNull()
        expect(f.transport._eventSource).toBeUndefined()
        expect(f.abort).toHaveBeenCalledTimes(2)
    })

    it('retains the original transport until registered work actually settles', async () => {
        const f = fixture()
        let settle!: () => void
        const drain = new Promise<void>((resolve) => {
            settle = resolve
        })
        Reflect.set(f.toolset, 'executionDrains', new Set([drain]))
        await f.toolset.close()
        expect(f.abort).not.toHaveBeenCalled()
        expect(f.close).not.toHaveBeenCalled()
        settle()
        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(f.destroy).toHaveBeenCalledTimes(1)
        expect(f.close).toHaveBeenCalledTimes(1)
    })
})
