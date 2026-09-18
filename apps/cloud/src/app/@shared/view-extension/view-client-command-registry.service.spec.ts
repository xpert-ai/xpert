import { ViewClientCommandRegistry, ViewClientCommandContext } from './view-client-command-registry.service'

describe('ViewClientCommandRegistry', () => {
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
