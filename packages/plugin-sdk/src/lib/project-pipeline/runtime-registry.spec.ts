import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { DiscoveryModule } from '@nestjs/core'
import { StrategyBus } from '../core/strategy-bus'
import { PLUGIN_METADATA_KEY, ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey } from '../types'
import { ProjectPipelineRuntimeAdapterProvider, ProjectPipelineRuntimeAdapterRegistry } from './runtime-registry'

@ProjectPipelineRuntimeAdapterProvider('policy', 'neutral.route@1')
class NeutralPolicy {
  readonly kind = 'policy' as const
  readonly ref = 'neutral.route@1'
  evaluate = jest.fn(async () => ({ status: 'decided' as const, outcome: 'accept', evidence: [] }))
}

describe('pipeline runtime adapter registry', () => {
  it('resolves resource adapters in scope without executing the resolver during registration', async () => {
    const { module, registry } = await fixture()
    const resolver = { kind: 'resource' as const, ref: 'neutral.resources@1', resolve: jest.fn(async () => []) }
    registry.register('resource:neutral.resources@1', resolver, {
      kind: 'plugin',
      pluginName: 'resources',
      scopeKey: 'org-a'
    })
    expect(
      registry.resolve('resource', resolver.ref, { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'u' })
    ).toBe(resolver)
    expect(resolver.resolve).not.toHaveBeenCalled()
    expect(() =>
      registry.resolve('resource', resolver.ref, { tenantId: 'tenant-a', organizationId: 'org-b', userId: 'u' })
    ).toThrow('UNAVAILABLE')
    registry.remove('org-a', 'resources')
    expect(() =>
      registry.resolve('resource', resolver.ref, { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'u' })
    ).toThrow('UNAVAILABLE')
    await module.close()
  })
  async function fixture() {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [StrategyBus, ProjectPipelineRuntimeAdapterRegistry, NeutralPolicy]
    }).compile()
    await module.init()
    return { module, registry: module.get(ProjectPipelineRuntimeAdapterRegistry) }
  }
  it('discovers typed runtime adapters independently without invoking domain code', async () => {
    const { module, registry } = await fixture()
    const adapter = registry.resolve('policy', 'neutral.route@1', { tenantId: 'tenant-a', userId: 'user-a' })
    expect(adapter).toBe(module.get(NeutralPolicy))
    expect(adapter.evaluate).not.toHaveBeenCalled()
    expect(() => registry.resolve('completion', 'neutral.route@1', { tenantId: 'tenant-a', userId: 'user-a' })).toThrow(
      'UNAVAILABLE'
    )
    await module.close()
  })
  it('keeps tenant and organization resolution explicit and removes only the unloaded plugin scope', async () => {
    const { module, registry } = await fixture()
    const tenant = new NeutralPolicy(),
      organization = new NeutralPolicy()
    registry.register('policy:neutral.route@1', tenant, {
      kind: 'plugin',
      pluginName: 'tenant-plugin',
      scopeKey: getTenantGlobalScopeKey('tenant-a')
    })
    registry.register('policy:neutral.route@1', organization, {
      kind: 'plugin',
      pluginName: 'org-plugin',
      scopeKey: 'org-a'
    })
    expect(
      registry.resolve('policy', 'neutral.route@1', { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'u' })
    ).toBe(organization)
    expect(registry.resolve('policy', 'neutral.route@1', { tenantId: 'tenant-a', userId: 'u' })).toBe(tenant)
    expect(registry.resolve('policy', 'neutral.route@1', { tenantId: 'tenant-b', userId: 'u' })).toBe(
      module.get(NeutralPolicy)
    )
    registry.remove('org-a', 'org-plugin')
    expect(
      registry.resolve('policy', 'neutral.route@1', { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'u' })
    ).toBe(tenant)
    expect(() => registry.resolve('policy', 'neutral.route@1', { tenantId: '', userId: 'u' })).toThrow('UNAVAILABLE')
    await module.close()
  })
  it('rejects both direct and discovered cross-plugin takeover, including reuse of the same object', async () => {
    const { module, registry } = await fixture()
    const adapter = new NeutralPolicy()
    registry.register('policy:neutral.route@1', adapter, { kind: 'plugin', pluginName: 'original', scopeKey: 'org' })
    expect(() =>
      registry.register('policy:neutral.route@1', adapter, { kind: 'plugin', pluginName: 'other', scopeKey: 'org' })
    ).toThrow('OWNER_CONFLICT')
    @ProjectPipelineRuntimeAdapterProvider('policy', 'neutral.route@1')
    class Impostor extends NeutralPolicy {}
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, 'impostor', Impostor)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org', Impostor)
    expect(() => registry.upsert(new Impostor())).toThrow('OWNER_CONFLICT')
    await module.close()
  })
  it('rejects mismatched references and missing inspect support before registration', async () => {
    const { module, registry } = await fixture()
    expect(() =>
      registry.register('policy:other.route@1', new NeutralPolicy(), { kind: 'builtin', scopeKey: 'org' })
    ).toThrow('KEY_MISMATCH')
    expect(() =>
      registry.register(
        'operation:neutral.execute@1',
        {
          kind: 'operation',
          ref: 'neutral.execute@1',
          execute: async () => ({ status: 'unknown', receiptKey: 'r' })
        } as never,
        { kind: 'builtin', scopeKey: 'org' }
      )
    ).toThrow('CONTRACT_INVALID')
    await module.close()
  })
})
