import { SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY, SYSTEM_GLOBAL_SCOPE } from '../types'
import { SandboxRuntimeProviderStrategy } from './runtime-provider.decorator'
import { SandboxRuntimeProviderRegistry } from './runtime-provider.registry'

describe('SandboxRuntimeProviderRegistry', () => {
  it('ignores primitive values returned by provider discovery', () => {
    const registry = new SandboxRuntimeProviderRegistry({ getProviders: () => [] } as never, new Reflector())

    for (const value of ['provider-value', 1, true, Symbol('provider')]) {
      expect(() => registry.upsert(value)).not.toThrow()
    }

    expect(registry.list()).toEqual([])
  })

  it('ignores unrelated organization plugin providers without treating them as Runtime Providers', () => {
    const registry = new SandboxRuntimeProviderRegistry({ getProviders: () => [] } as never, new Reflector())
    class OrganizationService {}
    SetMetadata(PLUGIN_METADATA_KEY, '@acme/plugin')(OrganizationService)
    SetMetadata(ORGANIZATION_METADATA_KEY, 'organization-1')(OrganizationService)

    registry.upsert(new OrganizationService())

    expect(registry.list()).toEqual([])
  })

  it('accepts built-in and system plugin Providers but rejects organization plugin Providers', () => {
    const registry = new SandboxRuntimeProviderRegistry({ getProviders: () => [] } as never, new Reflector())

    class BuiltInProvider {}
    SandboxRuntimeProviderStrategy('built-in-runtime')(BuiltInProvider)

    class SystemProvider {}
    SandboxRuntimeProviderStrategy('system-runtime')(SystemProvider)
    SetMetadata(PLUGIN_METADATA_KEY, '@xpert-ai-pro/provider')(SystemProvider)
    SetMetadata(ORGANIZATION_METADATA_KEY, SYSTEM_GLOBAL_SCOPE)(SystemProvider)

    class OrganizationProvider {}
    SandboxRuntimeProviderStrategy('organization-runtime')(OrganizationProvider)
    SetMetadata(PLUGIN_METADATA_KEY, '@acme/unsafe-provider')(OrganizationProvider)
    SetMetadata(ORGANIZATION_METADATA_KEY, 'organization-1')(OrganizationProvider)

    registry.upsert(new BuiltInProvider())
    registry.upsert(new SystemProvider())
    registry.upsert(new OrganizationProvider())

    expect(registry.list()).toEqual(expect.arrayContaining([expect.any(BuiltInProvider), expect.any(SystemProvider)]))
    expect(registry.list()).not.toEqual(expect.arrayContaining([expect.any(OrganizationProvider)]))
    expect(() => registry.get('organization-runtime')).toThrow("No strategy found for type 'organization-runtime'")
  })
})
