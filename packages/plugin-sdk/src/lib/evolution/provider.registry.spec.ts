import { EvolutionTargetProvider } from '@xpert-ai/contracts'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BUILTIN_GLOBAL_SCOPE, StrategyBus } from '../types'
import { EvolutionTargetProviderStrategy } from './provider.decorator'
import { EvolutionTargetProviderRegistry } from './provider.registry'

@EvolutionTargetProviderStrategy('fixture.mapping')
class FixtureProvider implements EvolutionTargetProvider {
  readonly descriptor = {
    targetId: 'fixture.mapping',
    targetType: 'test_fixture' as const,
    displayName: 'Fixture Mapping',
    providerKey: 'fixture.mapping',
    providerVersion: '1.0.0',
    artifactSchemaVersion: '1',
    supportedScopes: ['organization' as const],
    riskLevel: 'R1' as const,
    metricSetId: 'fixture.accuracy',
    capabilities: {
      candidateBuild: true,
      replay: true,
      shadow: true,
      canary: true,
      install: true,
      rollback: true
    },
    status: 'active' as const
  }
}

describe('EvolutionTargetProviderRegistry', () => {
  it('discovers a typed provider and exposes its descriptor', () => {
    const provider = new FixtureProvider()
    const discovery = {
      getProviders: () => [{ instance: provider }]
    } satisfies Pick<DiscoveryService, 'getProviders'>
    const registry = new EvolutionTargetProviderRegistry(discovery as DiscoveryService, new Reflector())
    Object.defineProperty(registry, 'bus', {
      value: { events$: { pipe: () => ({ subscribe: () => undefined }) } } satisfies Partial<StrategyBus>
    })

    registry.onModuleInit()

    expect(registry.get('fixture.mapping', BUILTIN_GLOBAL_SCOPE)).toBe(provider)
    expect(registry.listDescriptors(BUILTIN_GLOBAL_SCOPE)).toEqual([provider.descriptor])
  })
})
