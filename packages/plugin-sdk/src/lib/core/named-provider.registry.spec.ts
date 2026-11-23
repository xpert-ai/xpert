import 'reflect-metadata'
import { Injectable } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from '../types'
import { type StrategySource } from '../strategy'
import { definePluginRegistration } from './provider-registration'
import { NamedProviderRegistry } from './named-provider.registry'
import { StrategyBus } from './strategy-bus'

const key = 'EXAMPLE_REPORT_RENDERER'
const ReportRenderer = definePluginRegistration(key, 'report renderer')
const owner = '@example/reports'
const name = owner + ':preview'
interface Renderer {
  render(input: string): string
}

@Injectable()
class ReportRegistry extends NamedProviderRegistry<Renderer> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(key, discovery, reflector)
  }
  protected isProvider(instance: object): instance is Renderer {
    return 'render' in instance && typeof instance.render === 'function'
  }
}

function installation(pluginName = owner, scope = 'org') {
  @ReportRenderer(name)
  class Report {
    render(input: string) {
      return 'Report: ' + input
    }
  }
  Reflect.defineMetadata(PLUGIN_METADATA_KEY, pluginName, Report)
  Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope, Report)
  return new Report()
}

async function fixture() {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StrategyBus, ReportRegistry]
  }).compile()
  await module.init()
  return module
}

it('discovers and resolves a non-Widget provider through the shared lifecycle', async () => {
  @ReportRenderer('report.preview')
  class Preview {
    render(input: string) {
      return 'Preview: ' + input
    }
  }
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StrategyBus, ReportRegistry, Preview]
  }).compile()
  try {
    await module.init()
    const registry = module.get(ReportRegistry)
    expect(registry.findByName('report.preview')).toBe(module.get(Preview))
    expect(registry.findByName('report.preview').render('sales')).toBe('Preview: sales')
    expect(registry.findByName('missing')).toBeUndefined()
  } finally {
    await module.close()
  }
})

it('applies ownership and strict conflicts to programmatic preflight and registration', async () => {
  const module = await fixture()
  try {
    const registry = module.get(ReportRegistry)
    const first = installation()
    const replacement = installation()
    const source: StrategySource = { kind: 'plugin', pluginName: owner, scopeKey: 'org' }
    registry.register(name, first, source)
    expect(() => registry.assertCanRegister(name, first, source)).not.toThrow()
    expect(() => registry.register(name, first, source)).not.toThrow()
    expect(() => registry.assertCanRegister(name, replacement, source)).toThrow('already registered')
    expect(() => registry.register(name, replacement, source)).toThrow('already registered')
    expect(() => registry.register(name, replacement, { ...source, pluginName: '@other/reports' })).toThrow(
      'does not belong'
    )
    expect(() => registry.register('report.preview', replacement, source)).toThrow('does not belong')
    expect(registry.findByName(name, 'org')).toBe(first)
    registry.remove('org', owner)
    registry.register(name, replacement, source)
    expect(registry.findByName(name, 'org')).toBe(replacement)
  } finally {
    await module.close()
  }
})

it('retains the existing provider after a rejected event and continues accepting later lifecycle events', async () => {
  const module = await fixture()
  try {
    const registry = module.get(ReportRegistry)
    const bus = module.get(StrategyBus)
    const emit = (instance: Renderer) => bus.upsert(key, { instance, sourceId: 'test', sourceKind: 'plugin' })
    const first = installation()
    const replacement = installation()
    const otherScope = installation(owner, 'other-org')
    emit(first)
    emit(replacement)
    emit(installation('@other/reports'))
    emit(otherScope)
    expect(registry.findByName(name, 'org')).toBe(first)
    expect(registry.findByName(name, 'other-org')).toBe(otherScope)
    bus.remove('org', owner, 'refresh')
    emit(replacement)
    expect(registry.findByName(name, 'org')).toBe(replacement)
    bus.remove('org', owner, 'uninstall')
    expect(registry.findByName(name, 'org')).toBeUndefined()
    expect(registry.findByName(name, 'other-org')).toBe(otherScope)
  } finally {
    await module.close()
  }
})

it('rejects malformed implementations and metadata before storing the provider', async () => {
  @ReportRenderer('report.invalid')
  class Invalid {}
  class InvalidMetadata {
    render(input: string) {
      return input
    }
  }
  Reflect.defineMetadata(key, { name: 'report.invalid' }, InvalidMetadata)
  const module = await fixture()
  try {
    const registry = module.get(ReportRegistry)
    expect(() => registry.upsert(new Invalid())).toThrow('Invalid')
    expect(() => registry.upsert(new InvalidMetadata())).toThrow('registration name')
    expect(registry.listAllRegistrations()).toEqual([])
  } finally {
    await module.close()
  }
})
