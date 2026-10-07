/** @jest-environment jsdom */
jest.mock('@xpert-ai/shadcn-ui', () => ({ installShadcnThemeVars: jest.fn() }))
import { connect, request } from './bridge'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
const emit = (data: object) =>
    window.dispatchEvent(
        new MessageEvent('message', {
            source: window.parent,
            data: { channel: 'xpertai.remote_component', instanceId: 'view', ...data }
        })
    )
describe('topic map host bridge', () => {
    let close: () => void
    beforeEach(() => jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined))
    afterEach(() => {
        close?.()
        jest.restoreAllMocks()
    })
    it('restores typed host preferences and cancels old requests on a context change', async () => {
        const ready = jest.fn(),
            changed = jest.fn()
        close = connect(ready, changed)
        emit({
            type: 'init',
            scopeRevision: 1,
            locale: 'en-US',
            initialQuery: { parameters: { mode: 'list', direction: 'LR' } }
        })
        expect(ready).toHaveBeenCalledWith('en-US', expect.objectContaining({ mode: 'list', direction: 'LR' }))
        const pending = request('requestData', {}),
            failure = expect(pending).rejects.toThrow('Context changed')
        emit({ type: 'hostEvent', event: { type: 'view.context.changed', data: { revision: 2 } } })
        await failure
        expect(changed).toHaveBeenCalledTimes(1)
    })
    it('rejects pending work and removes listeners when the view closes', async () => {
        const ready = jest.fn()
        close = connect(ready, jest.fn())
        emit({ type: 'init', scopeRevision: 1 })
        const pending = request('requestData', {}),
            failure = expect(pending).rejects.toThrow('View closed')
        close()
        await failure
        emit({ type: 'init', scopeRevision: 2 })
        expect(ready).toHaveBeenCalledTimes(1)
    })
    it('uses host density and enables only payload-free diagnostic events explicitly', () => {
        const log = jest.spyOn(console, 'debug').mockImplementation(() => undefined)
        close = connect(jest.fn(), jest.fn())
        emit({ type: 'init', theme: { density: 'default', tokens: {} } })
        expect(installShadcnThemeVars).toHaveBeenLastCalledWith({ density: 'default' })
        expect(log).not.toHaveBeenCalled()
        emit({ type: 'init', debug: { enabled: true }, initialQuery: { secret: 'never-log-payload' } })
        expect(log).toHaveBeenCalledWith('[conversation-map]', 'initialized', { pendingCount: 0 })
        expect(JSON.stringify(log.mock.calls)).not.toContain('never-log-payload')
        log.mockClear()
        emit({ type: 'init', debug: { enabled: false } })
        expect(log).not.toHaveBeenCalled()
    })
})
