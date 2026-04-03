import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from './strategy'
import { GLOBAL_ORGANIZATION_SCOPE, ORGANIZATION_METADATA_KEY } from './types'

const TEST_STRATEGY_KEY = 'TEST_STRATEGY_KEY'

class TestStrategyRegistry<T> extends BaseStrategyRegistry<T> {
  constructor() {
    super(TEST_STRATEGY_KEY, {} as any, new Reflector())
  }
}

describe('BaseStrategyRegistry', () => {
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
})
