import 'reflect-metadata'
import { Injectable } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { StrategyBus } from './core/strategy-bus'
import { BaseStrategyRegistry, type StrategySource } from './strategy'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from './types'

const key = 'LIFECYCLE_TEST_STRATEGY'
interface Strategy {
  readonly id: string
}

@Injectable()
class Registry extends BaseStrategyRegistry<Strategy> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(key, discovery, reflector)
  }
}

class Provider {
  constructor(readonly id = 'discovered') {}
}
Reflect.defineMetadata(key, 'unqualified-name', Provider)
Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@example/provider', Provider)
Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org', Provider)

async function fixture() {
  return Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StrategyBus, Registry, Provider]
  }).compile()
}

it('discovers providers, filters lifecycle events, avoids duplicate listeners and unsubscribes on module close', async () => {
  const module = await fixture()
  const registry = module.get(Registry)
  const bus = module.get(StrategyBus)
  const update = jest.spyOn(registry, 'upsert')
  const remove = jest.spyOn(registry, 'remove')
  const emit = (instance: Strategy, strategyType = key) =>
    bus.upsert(strategyType, { instance, sourceId: 'test', sourceKind: 'plugin' })
  try {
    await module.init()
    expect(registry.findByName('unqualified-name', 'org')).toBe(module.get(Provider))
    registry.onModuleInit()
    update.mockClear()
    emit(new Provider('unrelated'), 'OTHER_STRATEGY')
    expect(update).not.toHaveBeenCalled()
    const replacement = new Provider('replacement')
    emit(replacement)
    expect(update).toHaveBeenCalledTimes(1)
    expect(registry.get('unqualified-name', 'org')).toBe(replacement)
    bus.remove('other-org', '@example/provider', 'uninstall')
    expect(registry.findByName('unqualified-name', 'org')).toBe(replacement)
    bus.remove('org', '@example/provider', 'uninstall')
    expect(registry.findByName('unqualified-name', 'org')).toBeUndefined()
  } finally {
    await module.close()
  }
  update.mockClear()
  remove.mockClear()
  emit(new Provider('after-close'))
  bus.remove('org', '@example/provider', 'uninstall')
  expect(update).not.toHaveBeenCalled()
  expect(remove).not.toHaveBeenCalled()
  expect(registry.findByName('unqualified-name', 'org')).toBeUndefined()
})

it('preserves ordinary registry names, same-plugin replacement and cross-plugin registration checks', async () => {
  const module = await fixture()
  try {
    const registry = module.get(Registry)
    const first = { id: 'first' }
    const second = { id: 'second' }
    const source: StrategySource = { kind: 'plugin', pluginName: '@example/provider', scopeKey: 'org' }
    registry.register('unqualified-name', first, source)
    expect(registry.register('unqualified-name', second, source)).toBe(first)
    expect(registry.findByName('unqualified-name', 'org')).toBe(second)
    expect(() => registry.register('unqualified-name', first, { ...source, pluginName: '@other/provider' })).toThrow(
      'already registered'
    )
    expect(registry.get('unqualified-name', 'org')).toBe(second)
    expect(registry.findByName('missing', 'org')).toBeUndefined()
    expect(() => registry.get('missing', 'org')).toThrow('No strategy found')
  } finally {
    await module.close()
  }
})
