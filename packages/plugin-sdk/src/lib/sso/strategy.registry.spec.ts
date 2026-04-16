import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { GLOBAL_ORGANIZATION_SCOPE, ORGANIZATION_METADATA_KEY } from '../types'
import { SSO_PROVIDER } from './strategy.decorator'
import { SSOProviderRegistry } from './strategy.registry'

describe('SSOProviderRegistry', () => {
  function createRegistry() {
    return new SSOProviderRegistry({} as any, new Reflector())
  }

  it('prefers organization scoped providers over global providers of the same type', () => {
    class GlobalLarkProvider {
      describe = jest.fn()
    }
    Reflect.defineMetadata(SSO_PROVIDER, 'lark', GlobalLarkProvider)

    class OrganizationLarkProvider {
      describe = jest.fn()
    }
    Reflect.defineMetadata(SSO_PROVIDER, 'lark', OrganizationLarkProvider)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-1', OrganizationLarkProvider)

    const registry = createRegistry()
    const globalProvider = new GlobalLarkProvider()
    const organizationProvider = new OrganizationLarkProvider()

    registry.upsert(globalProvider)
    registry.upsert(organizationProvider)

    expect(registry.get('lark', 'org-1')).toBe(organizationProvider)
    expect(registry.get('lark', GLOBAL_ORGANIZATION_SCOPE)).toBe(globalProvider)
  })

  it('lists global providers as fallback when the organization does not override them', () => {
    class GlobalGithubProvider {
      describe = jest.fn()
    }
    Reflect.defineMetadata(SSO_PROVIDER, 'github', GlobalGithubProvider)

    const registry = createRegistry()
    const globalProvider = new GlobalGithubProvider()
    registry.upsert(globalProvider)

    expect(registry.list('org-2')).toEqual([globalProvider])
  })
})
