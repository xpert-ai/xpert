import {
  ViewClientCommandContext,
  ViewClientCommandRegistry
} from '../../@shared/view-extension/view-client-command-registry.service'
import { registerDataSourceCreateCommand } from './data-source-create-client-command'

const context: ViewClientCommandContext = {
  hostType: 'agent',
  hostId: 'assistant-1',
  viewKey: 'data-workbench',
  manifest: {
    key: 'data-workbench',
    title: { en_US: 'Data Workbench' },
    hostType: 'agent',
    slot: 'workbench.fixed',
    source: { provider: 'data-workbench', plugin: 'example-data-plugin' },
    view: {
      type: 'remote_component',
      runtime: 'react',
      protocolVersion: 1,
      component: { isolation: 'iframe', entry: 'main' }
    },
    dataSource: { mode: 'platform' }
  }
}

describe('Platform data source creation command', () => {
  it('returns only the created id after the platform dialog saves', async () => {
    const registry = new ViewClientCommandRegistry()
    const create = jest.fn(async () => ({ id: 'source-1', options: { password: 'not-for-the-plugin' } }))
    registerDataSourceCreateCommand(registry, { canCreate: () => true, create })
    await expect(registry.execute('platform.data-source.create', {}, context)).resolves.toEqual({
      success: true,
      status: 'created',
      dataSourceId: 'source-1'
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('keeps cancellation distinct from successful creation', async () => {
    const registry = new ViewClientCommandRegistry()
    registerDataSourceCreateCommand(registry, { canCreate: () => true, create: async () => undefined })
    await expect(registry.execute('platform.data-source.create', {}, context)).resolves.toEqual({
      success: true,
      status: 'cancelled'
    })
  })

  it('does not open the dialog without edit permission', async () => {
    const registry = new ViewClientCommandRegistry()
    const create = jest.fn(async () => ({ id: 'source-1' }))
    registerDataSourceCreateCommand(registry, { canCreate: () => false, create })
    expect(await registry.execute('platform.data-source.create', {}, context)).toMatchObject({
      success: false,
      code: 'forbidden'
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('allows other plugins with edit permission to create a data source', async () => {
    const registry = new ViewClientCommandRegistry()
    const create = jest.fn(async () => ({ id: 'source-2' }))
    registerDataSourceCreateCommand(registry, { canCreate: () => true, create })
    const otherContext = {
      ...context,
      manifest: { ...context.manifest, source: { provider: 'other', plugin: 'other' } }
    }
    await expect(registry.execute('platform.data-source.create', {}, otherContext)).resolves.toEqual({
      success: true,
      status: 'created',
      dataSourceId: 'source-2'
    })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('unregisters when its host is destroyed', async () => {
    const registry = new ViewClientCommandRegistry()
    const unregister = registerDataSourceCreateCommand(registry, {
      canCreate: () => true,
      create: async () => undefined
    })
    unregister()
    expect(await registry.execute('platform.data-source.create', {}, context)).toMatchObject({
      success: false,
      code: 'unsupported'
    })
  })
})
