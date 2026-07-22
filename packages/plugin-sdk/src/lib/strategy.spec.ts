import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from './strategy'
import { StrategyBus } from './core/strategy-bus'
import {
  GLOBAL_ORGANIZATION_SCOPE,
  SYSTEM_GLOBAL_SCOPE,
  getTenantGlobalScopeKey,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  setDefaultTenantId
} from './types'
import { RequestContext } from './core/context'

const TEST_STRATEGY_KEY = 'TEST_STRATEGY_KEY'

class TestStrategyRegistry<T> extends BaseStrategyRegistry<T> {
  constructor(discoveryService = { getProviders: () => [] }) {
    super(TEST_STRATEGY_KEY, discoveryService as any, new Reflector())
  }
}

describe('BaseStrategyRegistry', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    setDefaultTenantId(null)
  })

  function mockRequestScope(tenantId: string, organizationId: string | null = 'org-1') {
    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
      tenantId,
      level: organizationId ? 'organization' : 'tenant',
      organizationId: organizationId ?? undefined
    } as any)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
  }

  it('prefers organization strategies over global ones when listing and resolving by type', () => {
    class GlobalSharedStrategy {
      readonly id = 'global-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', GlobalSharedStrategy)

    class OrganizationSharedStrategy {
      readonly id = 'organization-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', OrganizationSharedStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-1', OrganizationSharedStrategy)

    class GlobalFallbackStrategy {
      readonly id = 'global-fallback'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'fallback', GlobalFallbackStrategy)

    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    const globalShared = new GlobalSharedStrategy()
    const organizationShared = new OrganizationSharedStrategy()
    const globalFallback = new GlobalFallbackStrategy()

    registry.upsert(globalShared)
    registry.upsert(organizationShared)
    registry.upsert(globalFallback)

    expect(registry.get('shared', 'org-1')).toBe(organizationShared)
    expect(registry.list('org-1')).toEqual([organizationShared, globalFallback])
    expect(registry.list(GLOBAL_ORGANIZATION_SCOPE)).toEqual([globalShared, globalFallback])
  })

  it('keeps global strategies as fallbacks when the organization does not override that type', () => {
    class GlobalOnlyStrategy {
      readonly id = 'global-only'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'global-only', GlobalOnlyStrategy)

    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    const globalOnly = new GlobalOnlyStrategy()

    registry.upsert(globalOnly)

    expect(registry.get('global-only', 'org-2')).toBe(globalOnly)
    expect(registry.list('org-2')).toEqual([globalOnly])
  })

  it('uses only the current tenant global strategies as organization fallback', () => {
    setDefaultTenantId('tenant-default')

    class TenantOneGlobalStrategy {
      readonly id = 'tenant-one-global'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'tenant-global', TenantOneGlobalStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey('tenant-1'), TenantOneGlobalStrategy)

    class TenantTwoGlobalStrategy {
      readonly id = 'tenant-two-global'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'tenant-global', TenantTwoGlobalStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey('tenant-2'), TenantTwoGlobalStrategy)

    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    const tenantOneGlobal = new TenantOneGlobalStrategy()
    const tenantTwoGlobal = new TenantTwoGlobalStrategy()

    registry.upsert(tenantOneGlobal)
    registry.upsert(tenantTwoGlobal)

    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
      tenantId: 'tenant-1',
      level: 'organization',
      organizationId: 'org-1'
    } as any)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')

    expect(registry.get('tenant-global', 'org-1')).toBe(tenantOneGlobal)
    expect(registry.list('org-1')).toEqual([tenantOneGlobal])
    ;(RequestContext.getScope as jest.Mock).mockReturnValue({
      tenantId: 'tenant-2',
      level: 'organization',
      organizationId: 'org-2'
    })
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-2')

    expect(registry.get('tenant-global', 'org-2')).toBe(tenantTwoGlobal)
    expect(registry.list('org-2')).toEqual([tenantTwoGlobal])
  })

  it('keeps builtin strategies visible to non-default tenants without exposing default tenant global plugins', () => {
    setDefaultTenantId('tenant-default')

    class BuiltinStrategy {
      readonly id = 'builtin'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'builtin', BuiltinStrategy)

    class DefaultTenantGlobalPluginStrategy {
      readonly id = 'default-tenant-global'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'default-global', DefaultTenantGlobalPluginStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, GLOBAL_ORGANIZATION_SCOPE, DefaultTenantGlobalPluginStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/default-plugin', DefaultTenantGlobalPluginStrategy)

    class OtherTenantGlobalPluginStrategy {
      readonly id = 'other-tenant-global'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'tenant-global', OtherTenantGlobalPluginStrategy)
    Reflect.defineMetadata(
      ORGANIZATION_METADATA_KEY,
      getTenantGlobalScopeKey('tenant-other'),
      OtherTenantGlobalPluginStrategy
    )
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/other-plugin', OtherTenantGlobalPluginStrategy)

    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    const builtin = new BuiltinStrategy()
    const defaultTenantGlobal = new DefaultTenantGlobalPluginStrategy()
    const otherTenantGlobal = new OtherTenantGlobalPluginStrategy()

    registry.upsert(builtin)
    registry.upsert(defaultTenantGlobal)
    registry.upsert(otherTenantGlobal)

    mockRequestScope('tenant-other', 'org-other')

    expect(registry.get('builtin', 'org-other')).toBe(builtin)
    expect(registry.get('tenant-global', GLOBAL_ORGANIZATION_SCOPE)).toBe(otherTenantGlobal)
    expect(() => registry.get('default-global', GLOBAL_ORGANIZATION_SCOPE)).toThrow(
      "No strategy found for type 'default-global'"
    )
    expect(registry.list(GLOBAL_ORGANIZATION_SCOPE)).toEqual([otherTenantGlobal, builtin])

    mockRequestScope('tenant-default', 'org-default')

    expect(registry.get('default-global', 'org-default')).toBe(defaultTenantGlobal)
    expect(registry.get('builtin', 'org-default')).toBe(builtin)
  })

  it('applies organization, tenant-global, system-global, then builtin strategy precedence', () => {
    setDefaultTenantId('tenant-default')

    class BuiltinSharedStrategy {
      readonly id = 'builtin-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', BuiltinSharedStrategy)

    class BuiltinOnlyStrategy {
      readonly id = 'builtin-only'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'builtin-only', BuiltinOnlyStrategy)

    class SystemSharedStrategy {
      readonly id = 'system-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', SystemSharedStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, SYSTEM_GLOBAL_SCOPE, SystemSharedStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/system-plugin', SystemSharedStrategy)

    class SystemOnlyStrategy {
      readonly id = 'system-only'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'system-only', SystemOnlyStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, SYSTEM_GLOBAL_SCOPE, SystemOnlyStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/system-plugin', SystemOnlyStrategy)

    class TenantSharedStrategy {
      readonly id = 'tenant-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', TenantSharedStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey('tenant-other'), TenantSharedStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/tenant-plugin', TenantSharedStrategy)

    class TenantOnlyStrategy {
      readonly id = 'tenant-only'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'tenant-only', TenantOnlyStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey('tenant-other'), TenantOnlyStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/tenant-plugin', TenantOnlyStrategy)

    class OrganizationSharedStrategy {
      readonly id = 'organization-shared'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'shared', OrganizationSharedStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-other', OrganizationSharedStrategy)

    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    const builtinShared = new BuiltinSharedStrategy()
    const builtinOnly = new BuiltinOnlyStrategy()
    const systemShared = new SystemSharedStrategy()
    const systemOnly = new SystemOnlyStrategy()
    const tenantShared = new TenantSharedStrategy()
    const tenantOnly = new TenantOnlyStrategy()
    const organizationShared = new OrganizationSharedStrategy()

    registry.upsert(builtinShared)
    registry.upsert(builtinOnly)
    registry.upsert(systemShared)
    registry.upsert(systemOnly)
    registry.upsert(tenantShared)
    registry.upsert(tenantOnly)
    registry.upsert(organizationShared)

    mockRequestScope('tenant-other', 'org-other')

    expect(registry.get('shared', 'org-other')).toBe(organizationShared)
    expect(registry.get('shared', GLOBAL_ORGANIZATION_SCOPE)).toBe(tenantShared)
    expect(registry.get('system-only', 'org-other')).toBe(systemOnly)
    expect(registry.list('org-other')).toEqual([organizationShared, tenantOnly, systemOnly, builtinOnly])
  })

  it('registers strategies emitted after module initialization through the strategy bus', () => {
    class DynamicPluginStrategy {
      readonly id = 'dynamic-plugin'
    }
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'dynamic', DynamicPluginStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/dynamic-plugin', DynamicPluginStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-1', DynamicPluginStrategy)

    const bus = new StrategyBus()
    const registry = new TestStrategyRegistry<{
      readonly id: string
    }>()
    ;(registry as any).bus = bus
    registry.onModuleInit()

    const strategy = new DynamicPluginStrategy()
    bus.upsert(TEST_STRATEGY_KEY, {
      instance: strategy,
      sourceId: '@xpert/dynamic-plugin',
      sourceKind: 'plugin'
    })

    expect(registry.get('dynamic', 'org-1')).toBe(strategy)
    expect(registry.list('org-1')).toEqual([strategy])
  })

  it('exposes explicit built-in and plugin provenance for registered strategies', () => {
    class BuiltinStrategy {}
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'builtin', BuiltinStrategy)

    class PluginStrategy {}
    Reflect.defineMetadata(TEST_STRATEGY_KEY, 'plugin', PluginStrategy)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/plugin', PluginStrategy)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-1', PluginStrategy)

    const registry = new TestStrategyRegistry<object>()

    expect(registry.getSource(new BuiltinStrategy())).toEqual({
      kind: 'builtin',
      scopeKey: 'builtin:global'
    })
    expect(registry.getSource(new PluginStrategy())).toEqual({
      kind: 'plugin',
      pluginName: '@xpert/plugin',
      scopeKey: 'org-1'
    })
  })
})
