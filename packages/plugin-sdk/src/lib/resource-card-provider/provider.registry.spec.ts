import 'reflect-metadata'
import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { RequestContext } from '../core/context'
import { setDefaultTenantId } from '../types'
import { StrategyBus } from '../core/strategy-bus'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY, getTenantGlobalScopeKey, SYSTEM_GLOBAL_SCOPE } from '../types'
import { ResourceCardProvider, RESOURCE_CARD_PROVIDER } from './provider.decorator'
import { ResourceCardProviderRegistry } from './provider.registry'
import type { ResourceCardType } from './types'

const report = { namespace: 'example', type: 'report' }
function plugin(name: string, scope: string, resources: ResourceCardType[] = [report]) {
  @ResourceCardProvider(...resources)
  class Provider {
    resolveMany = jest.fn().mockResolvedValue([])
  }
  Reflect.defineMetadata(PLUGIN_METADATA_KEY, name, Provider)
  Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope, Provider)
  return new Provider()
}

async function fixture() {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StrategyBus, ResourceCardProviderRegistry]
  }).compile()
  await module.init()
  return { module, registry: module.get(ResourceCardProviderRegistry), bus: module.get(StrategyBus) }
}

describe('optional ResourceCardProvider registration', () => {
  beforeEach(() => {
    setDefaultTenantId('default-tenant')
    jest
      .spyOn(RequestContext, 'getScope')
      .mockReturnValue({ tenantId: 'tenant', organizationId: 'org', level: 'organization' })
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
  })
  afterEach(() => {
    jest.restoreAllMocks()
    setDefaultTenantId(null)
  })

  it('discovers builtin providers without a special plugin registration path', async () => {
    @ResourceCardProvider(report)
    class Builtin {
      async resolveMany() {
        return []
      }
    }
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [StrategyBus, ResourceCardProviderRegistry, Builtin]
    }).compile()
    try {
      await module.init()
      expect(module.get(ResourceCardProviderRegistry).find(report)).toBe(module.get(Builtin))
    } finally {
      await module.close()
    }
  })

  it('uses exact namespace/type routes and isolates organization and tenant installations', async () => {
    const f = await fixture()
    try {
      const global = plugin('example', SYSTEM_GLOBAL_SCOPE)
      const tenant = plugin('example', getTenantGlobalScopeKey('tenant'))
      const org = plugin('example', 'org')
      const foreign = plugin('example', 'foreign-org')
      for (const instance of [global, tenant, org, foreign]) f.registry.upsert(instance)
      expect(f.registry.find(report, 'org')).toBe(org)
      expect(f.registry.find(report, 'another-org')).toBe(tenant)
      expect(f.registry.find({ namespace: 'other', type: 'report' })).toBeUndefined()
      expect(f.registry.find({ namespace: 'example', type: 'other' })).toBeUndefined()
      jest.spyOn(RequestContext, 'getScope').mockReturnValue({ tenantId: 'another-tenant', level: 'tenant' })
      expect(f.registry.find(report, 'another-org')).toBe(global)
    } finally {
      await f.module.close()
    }
  })

  it('handles plugin load, refresh and uninstall without losing the lifecycle subscription', async () => {
    const f = await fixture()
    const upsert = (instance: object) =>
      f.bus.upsert(RESOURCE_CARD_PROVIDER, { instance, sourceId: 'test', sourceKind: 'plugin' })
    try {
      const first = plugin('example', 'org')
      upsert(first)
      expect(f.registry.find(report)).toBe(first)
      const replacement = plugin('example', 'org')
      upsert(replacement)
      expect(f.registry.find(report)).toBe(replacement)
      upsert(plugin('conflicting-plugin', 'org'))
      expect(f.registry.find(report)).toBe(replacement)
      f.bus.remove('org', 'example', 'refresh')
      expect(f.registry.find(report)).toBeUndefined()
      const nextOwner = plugin('new-owner', 'org')
      upsert(nextOwner)
      f.bus.remove('org', 'example', 'uninstall')
      expect(f.registry.find(report)).toBe(nextOwner)
      f.bus.remove('org', 'new-owner', 'uninstall')
      expect(f.registry.find(report)).toBeUndefined()
    } finally {
      await f.module.close()
    }
  })

  it('rejects all routes in a conflicting batch and prevents another scope from hijacking a resource type', async () => {
    const f = await fixture()
    try {
      const first = plugin('example', SYSTEM_GLOBAL_SCOPE)
      f.registry.upsert(first)
      expect(() => f.registry.upsert(plugin('other', 'org', [{ namespace: 'other', type: 'free' }, report]))).toThrow(
        'already registered'
      )
      expect(f.registry.find({ namespace: 'other', type: 'free' })).toBeUndefined()
      expect(f.registry.find(report)).toBe(first)
    } finally {
      await f.module.close()
    }
  })
})
