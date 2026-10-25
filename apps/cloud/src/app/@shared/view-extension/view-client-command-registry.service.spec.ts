import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry, ViewClientCommandContext } from './view-client-command-registry.service'

describe('ViewClientCommandRegistry', () => {
  it('does not mount a view whose required commands are absent or inactive', () => {
    const registry = new ViewClientCommandRegistry()
    const manifest: XpertExtensionViewManifest = { key: 'editor', title: 'Editor', hostType: 'agent', slot: 'agent.workbench', source: { provider: 'test' }, view: { type: 'table' }, dataSource: { mode: 'platform' }, clientCommands: [{ key: 'editor.status', required: true }, { key: 'optional.action' }] }
    expect(registry.supportsView(manifest)).toBe(false)
    let active = true
    const remove = registry.register('editor.status', () => undefined, () => active)
    expect(registry.supportsView(manifest)).toBe(true)
    active = false
    expect(registry.supportsView(manifest)).toBe(false)
    remove()
    expect(registry.supportsView(manifest)).toBe(false)
  })
  it('dispatches commands only to the active conversation and restores prior handlers on teardown', async () => {
    const registry = new ViewClientCommandRegistry()
    let active = 'task'
    const task = jest.fn(() => 'task-result')
    const assistant = jest.fn(() => 'assistant-result')
    registry.register('send', task, () => active === 'task')
    const removeAssistant = registry.register('send', assistant, () => active === 'assistant')
    const context = { hostType: 'agent', hostId: 'xpert', viewKey: 'view' } as ViewClientCommandContext
    expect(await registry.execute('send', {}, context)).toBe('task-result')
    expect(assistant).not.toHaveBeenCalled()
    active = 'assistant'
    expect(await registry.execute('send', {}, context)).toBe('assistant-result')
    removeAssistant()
    expect(await registry.execute('send', {}, context)).toMatchObject({ success: false, code: 'unsupported' })
    active = 'task'
    expect(await registry.execute('send', {}, context)).toBe('task-result')
  })
})
