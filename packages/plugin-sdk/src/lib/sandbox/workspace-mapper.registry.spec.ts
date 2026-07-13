import { SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from '../types'
import { SandboxWorkspaceMapperRegistry } from './workspace-mapper.registry'

describe('SandboxWorkspaceMapperRegistry', () => {
  it('ignores primitive values returned by provider discovery', () => {
    const registry = new SandboxWorkspaceMapperRegistry({ getProviders: () => [] } as never, new Reflector())

    for (const value of ['provider-value', 1, true, Symbol('provider')]) {
      expect(() => registry.upsert(value)).not.toThrow()
    }

    expect(registry.list()).toEqual([])
  })

  it('ignores unrelated organization plugin providers without treating them as workspace mappers', () => {
    const registry = new SandboxWorkspaceMapperRegistry({ getProviders: () => [] } as never, new Reflector())
    class OrganizationService {}
    SetMetadata(PLUGIN_METADATA_KEY, '@acme/plugin')(OrganizationService)
    SetMetadata(ORGANIZATION_METADATA_KEY, 'organization-1')(OrganizationService)

    registry.upsert(new OrganizationService())

    expect(registry.list()).toEqual([])
  })
})
