/** @jest-environment jsdom */
jest.mock('@xpert-ai/shadcn-ui', () => ({ installShadcnThemeVars: jest.fn() }))
import { connect, request, preferredMapMode, mergePrefs, prefsSchema } from './bridge'
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
    it.each(['tree', 'graph'] as const)('restores a legacy %s link as its existing Map perspective', (mode) => {
        const ready = jest.fn()
        close = connect(ready, jest.fn())
        emit({ type: 'init', initialQuery: { parameters: { mode } } })
        const restored = prefsSchema.parse(ready.mock.calls[0][1])
        expect(restored.mode).toBe(mode)
        expect(preferredMapMode(restored)).toBe(mode)
    })
    it.each(['list', 'growth'] as const)('remembers Map perspective through %s and host reload', (mode) => {
        const ready = jest.fn()
        close = connect(ready, jest.fn())
        const previous = prefsSchema.parse({ mode: 'graph', mapMode: 'tree', direction: 'LR' })
        const saved = mergePrefs(previous, { mode })
        emit({ type: 'init', initialQuery: { parameters: saved } })
        const restored = prefsSchema.parse(ready.mock.calls[0][1])
        const returned = mergePrefs(restored, { mode: preferredMapMode(restored) })
        expect(restored).toMatchObject({ mode, mapMode: 'graph', direction: 'LR' })
        expect(returned).toMatchObject({ mode: 'graph', mapMode: 'graph', direction: 'LR' })
        expect(mergePrefs(returned, { mode: 'tree' })).toMatchObject({ mode: 'tree', mapMode: 'tree' })
    })
    it('defaults new and older non-map preferences to branch paths', () => {
        expect(preferredMapMode(prefsSchema.parse({}))).toBe('tree')
        expect(preferredMapMode(prefsSchema.parse({ mode: 'list' }))).toBe('tree')
    })
    it('restores the growth tree and its typed conversation/reply anchors from host preferences', () => {
        const ready = jest.fn()
        close = connect(ready, jest.fn())
        const preferences = {
            mode: 'growth',
            trailConversationId: '22222222-2222-4222-8222-222222222222',
            trailThreadId: 'side-branch',
            trailMessageId: '55555555-5555-4555-8555-555555555555'
        }
        emit({ type: 'init', scopeRevision: 1, locale: 'zh-Hans', initialQuery: { parameters: preferences } })
        expect(ready).toHaveBeenCalledWith('zh-Hans', expect.objectContaining(preferences))
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
