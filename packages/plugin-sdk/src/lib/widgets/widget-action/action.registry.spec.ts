import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { RequestContext } from '../../core/context'
import { StrategyBus } from '../../core/strategy-bus'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from '../../types'
import {
  WidgetActionProvider,
  WidgetActionProviderRegistry,
  WIDGET_ACTION_PROVIDER,
  type WidgetActionContext
} from './index'

const owner = '@example/widget'
const providerName = owner + ':review'
const identity: WidgetActionContext = { threadId: 'thread', messageId: 'reply', widgetId: 'card', fields: {} }
function installation(pluginName: string, scope: string, key = providerName) {
  @WidgetActionProvider(key)
  class Provider {
    readonly run = jest.fn(async (_context: WidgetActionContext) => ({}))
    readonly actions = {
      confirm: { execute: (context: WidgetActionContext) => this.run(context) },
      cancel: { widgetSource: 'receipt' as const, execute: (context: WidgetActionContext) => this.run(context) }
    }
  }
  Reflect.defineMetadata(PLUGIN_METADATA_KEY, pluginName, Provider)
  Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope, Provider)
  return new Provider()
}

async function setup() {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StrategyBus, WidgetActionProviderRegistry]
  }).compile()
  await module.init()
  return module
}

it('isolates action sets, preserves the first provider on conflict and replaces the whole set on refresh', async () => {
  const module = await setup()
  const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
  try {
    const registry = module.get(WidgetActionProviderRegistry)
    const bus = module.get(StrategyBus)
    const install = (instance: object) =>
      bus.upsert(WIDGET_ACTION_PROVIDER, { instance, sourceId: 'fixture', sourceKind: 'plugin' })
    const a = installation(owner, 'org-a')
    const b = installation(owner, 'org-b')
    install(a)
    install(b)
    const replacement = installation(owner, 'org-a')
    install(replacement)
    install(installation('@other/widget', 'org-a'))
    for (const name of ['confirm', 'cancel'] as const) {
      expect(registry.resolve(providerName + '.' + name)).toBe(a.actions[name])
      await registry.resolve(providerName + '.' + name).execute(identity)
    }
    expect(a.run).toHaveBeenCalledTimes(2)
    expect(a.run).toHaveBeenCalledWith(identity)
    bus.remove('org-a', owner, 'refresh')
    expect(registry.resolve(providerName + '.confirm')).toBeUndefined()
    expect(registry.resolve(providerName + '.cancel')).toBeUndefined()
    install(replacement)
    expect(registry.resolve(providerName + '.confirm')).toBe(replacement.actions.confirm)
    expect(registry.resolve(providerName + '.cancel')).toBe(replacement.actions.cancel)
    bus.remove('org-a', owner, 'uninstall')
    install(installation('@other/widget', 'org-a'))
    expect(registry.resolve(providerName + '.confirm')).toBeUndefined()
    expect(registry.resolve(providerName + '.cancel')).toBeUndefined()
    org.mockReturnValue('org-b')
    expect(registry.resolve(providerName + '.confirm')).toBe(b.actions.confirm)
    expect(registry.resolve(providerName + '.cancel')).toBe(b.actions.cancel)
  } finally {
    org.mockRestore()
    await module.close()
  }
})

it('uses exact provider namespaces and only dispatches explicitly declared own actions', async () => {
  const module = await setup()
  const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
  try {
    const registry = module.get(WidgetActionProviderRegistry)
    const first = installation(owner, 'org-a')
    const nested = installation(owner, 'org-a', providerName + '.detail')
    registry.upsert(first)
    registry.upsert(nested)
    expect(registry.resolve(providerName + '.confirm')).toBe(first.actions.confirm)
    expect(registry.resolve(providerName + '.detail.confirm')).toBe(nested.actions.confirm)
    for (const name of [
      '',
      'confirm',
      providerName,
      providerName + '.',
      providerName + '.missing',
      providerName + '.run',
      providerName + '.constructor',
      providerName + '.toString',
      providerName + '.__proto__'
    ]) {
      expect(registry.resolve(name)).toBeUndefined()
    }
    expect(first.run).not.toHaveBeenCalled()
  } finally {
    org.mockRestore()
    await module.close()
  }
})

it.each([
  null,
  [],
  {},
  { 'nested.confirm': { execute: async () => ({}) } },
  { 'foreign:confirm': { execute: async () => ({}) } },
  { ' confirm': { execute: async () => ({}) } },
  { confirm: null },
  { confirm: async () => ({}) },
  { confirm: { execute: 'invalid' } },
  { confirm: { execute: async () => ({}), widgetSource: 'invalid' } }
])('rejects malformed action declarations before registration: %j', async (actions) => {
  @WidgetActionProvider('test.review')
  class Invalid {
    readonly actions = actions
  }
  const module = await setup()
  try {
    const registry = module.get(WidgetActionProviderRegistry)
    expect(() => registry.upsert(new Invalid())).toThrow('Invalid')
    expect(registry.findByName('test.review')).toBeUndefined()
  } finally {
    await module.close()
  }
})
