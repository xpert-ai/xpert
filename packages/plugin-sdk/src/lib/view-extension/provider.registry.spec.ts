import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { RequestContext } from '../core/context'
import {
  GLOBAL_ORGANIZATION_SCOPE,
  SYSTEM_GLOBAL_SCOPE,
  getTenantGlobalScopeKey,
  ORGANIZATION_METADATA_KEY,
  PLUGIN_METADATA_KEY,
  setDefaultTenantId
} from '../types'
import { VIEW_EXTENSION_PROVIDER } from './provider.decorator'
import { ViewExtensionProviderRegistry } from './provider.registry'

describe('ViewExtensionProviderRegistry', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    setDefaultTenantId(null)
  })

  it('lists view extension providers using organization, tenant-global, system-global, then builtin precedence', () => {
    setDefaultTenantId('tenant-default')

    class BuiltinSharedProvider {
      readonly id = 'builtin-shared'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'shared', BuiltinSharedProvider)

    class BuiltinOnlyProvider {
      readonly id = 'builtin-only'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'builtin-only', BuiltinOnlyProvider)

    class SystemProvider {
      readonly id = 'system'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'system-only', SystemProvider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, SYSTEM_GLOBAL_SCOPE, SystemProvider)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/system-view-plugin', SystemProvider)

    class DefaultTenantGlobalProvider {
      readonly id = 'default-tenant-global'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'default-only', DefaultTenantGlobalProvider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, GLOBAL_ORGANIZATION_SCOPE, DefaultTenantGlobalProvider)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/default-view-plugin', DefaultTenantGlobalProvider)

    class TenantGlobalProvider {
      readonly id = 'tenant-global'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'tenant-only', TenantGlobalProvider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, getTenantGlobalScopeKey('tenant-other'), TenantGlobalProvider)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@xpert/tenant-view-plugin', TenantGlobalProvider)

    class OrganizationProvider {
      readonly id = 'organization'
    }
    Reflect.defineMetadata(VIEW_EXTENSION_PROVIDER, 'shared', OrganizationProvider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-other', OrganizationProvider)

    const registry = new ViewExtensionProviderRegistry({} as any, new Reflector())
    const builtinShared = new BuiltinSharedProvider()
    const builtinOnly = new BuiltinOnlyProvider()
    const system = new SystemProvider()
    const defaultTenantGlobal = new DefaultTenantGlobalProvider()
    const tenantGlobal = new TenantGlobalProvider()
    const organization = new OrganizationProvider()

    registry.upsert(builtinShared as any)
    registry.upsert(builtinOnly as any)
    registry.upsert(system as any)
    registry.upsert(defaultTenantGlobal as any)
    registry.upsert(tenantGlobal as any)
    registry.upsert(organization as any)

    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
      tenantId: 'tenant-other',
      level: 'organization',
      organizationId: 'org-other'
    } as any)
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-other')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-other')

    expect(registry.listEntries('org-other')).toEqual([
      { providerKey: 'shared', provider: organization },
      { providerKey: 'tenant-only', provider: tenantGlobal },
      { providerKey: 'system-only', provider: system },
      { providerKey: 'builtin-only', provider: builtinOnly }
    ])
    expect(registry.listEntries(GLOBAL_ORGANIZATION_SCOPE)).toEqual([
      { providerKey: 'tenant-only', provider: tenantGlobal },
      { providerKey: 'system-only', provider: system },
      { providerKey: 'shared', provider: builtinShared },
      { providerKey: 'builtin-only', provider: builtinOnly }
    ])
  })
})
