import 'reflect-metadata'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { RequestContext } from '../../core/context'
import {
  BUILTIN_GLOBAL_SCOPE,
  STRATEGY_META_KEY,
  SYSTEM_GLOBAL_SCOPE,
  getTenantGlobalScopeKey,
  setDefaultTenantId
} from '../../types'
import type { StrategySource } from '../../strategy'
import { KEYWORD_ANALYZER_STRATEGY, KeywordAnalyzerStrategy } from './strategy.decorator'
import type { IKeywordAnalyzerStrategy } from './strategy.interface'
import { KeywordAnalyzerRegistry } from './strategy.registry'

@KeywordAnalyzerStrategy('jieba')
class TestAnalyzer implements IKeywordAnalyzerStrategy {
  readonly meta = { id: 'jieba', label: 'Jieba', languages: ['zh'], revision: 'v1' }

  async analyze(text: string, _purpose: 'index' | 'query'): Promise<readonly string[]> {
    return [text]
  }
}

describe('KeywordAnalyzerRegistry', () => {
  let registry: KeywordAnalyzerRegistry
  const organizationSource: StrategySource = {
    kind: 'plugin',
    scopeKey: 'org-a',
    pluginName: '@example/jieba'
  }
  const tenantSource: StrategySource = {
    kind: 'plugin',
    scopeKey: getTenantGlobalScopeKey('tenant-a'),
    pluginName: '@example/jieba'
  }

  beforeEach(() => {
    setDefaultTenantId('tenant-default')
    jest.spyOn(RequestContext, 'getScope').mockReturnValue({
      level: 'organization',
      tenantId: 'tenant-a',
      organizationId: 'org-a'
    })
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-a')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
    registry = new KeywordAnalyzerRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
  })

  afterEach(() => {
    jest.restoreAllMocks()
    setDefaultTenantId(null)
  })

  it('discovers analyzers using the exported decorator metadata', async () => {
    const analyzer = new TestAnalyzer()
    expect(Reflect.getMetadata(STRATEGY_META_KEY, TestAnalyzer)).toBe(KEYWORD_ANALYZER_STRATEGY)
    expect(Reflect.getMetadata(KEYWORD_ANALYZER_STRATEGY, TestAnalyzer)).toBe('jieba')

    registry.upsert(analyzer)

    expect(registry.get('jieba')).toBe(analyzer)
    expect(registry.getSource(analyzer)).toEqual({ kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    expect(await registry.get('jieba').analyze('search', 'query')).toEqual(['search'])
  })

  it('keeps a pinned tenant plugin resolvable after an organization installs the same provider', () => {
    const tenantAnalyzer = new TestAnalyzer()
    const organizationAnalyzer = new TestAnalyzer()
    registry.register('jieba', tenantAnalyzer, tenantSource)
    registry.register('jieba', organizationAnalyzer, organizationSource)

    expect(registry.get('jieba')).toBe(organizationAnalyzer)
    expect(registry.getBySource('jieba', tenantSource)).toBe(tenantAnalyzer)
    expect(registry.getBySource('jieba', organizationSource)).toBe(organizationAnalyzer)
  })

  it('keeps builtin and system analyzers addressable beneath organization overrides', () => {
    const builtinSource: StrategySource = { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE }
    const systemSource: StrategySource = {
      kind: 'plugin',
      scopeKey: SYSTEM_GLOBAL_SCOPE,
      pluginName: '@example/system-jieba'
    }
    const builtin = new TestAnalyzer()
    const system = new TestAnalyzer()
    registry.register('jieba', builtin, builtinSource)
    registry.register('jieba', system, systemSource)
    registry.register('jieba', new TestAnalyzer(), organizationSource)

    expect(registry.getBySource('jieba', builtinSource)).toBe(builtin)
    expect(registry.getBySource('jieba', systemSource)).toBe(system)
  })

  it('rejects another plugin name or source kind in a visible scope', () => {
    registry.register('jieba', new TestAnalyzer(), organizationSource)

    expect(
      registry.getBySource('jieba', {
        kind: 'plugin',
        scopeKey: 'org-a',
        pluginName: '@example/other'
      })
    ).toBeUndefined()
    expect(registry.getBySource('jieba', { kind: 'builtin', scopeKey: 'org-a' })).toBeUndefined()
  })

  it('does not resolve a pinned plugin outside the requested organization or tenant', () => {
    const otherOrganization: StrategySource = {
      kind: 'plugin',
      scopeKey: 'org-b',
      pluginName: '@example/jieba'
    }
    const otherTenant: StrategySource = {
      kind: 'plugin',
      scopeKey: getTenantGlobalScopeKey('tenant-b'),
      pluginName: '@example/jieba'
    }
    registry.register('jieba', new TestAnalyzer(), otherOrganization)
    registry.register('jieba', new TestAnalyzer(), otherTenant)

    expect(registry.getBySource('jieba', otherOrganization, 'org-a')).toBeUndefined()
    expect(registry.getBySource('jieba', otherTenant, 'org-a')).toBeUndefined()
  })

  it('uses an explicit organization and returns undefined for missing providers', () => {
    const analyzer = new TestAnalyzer()
    registry.register('jieba', analyzer, organizationSource)

    expect(registry.getBySource('jieba', organizationSource, 'org-a')).toBe(analyzer)
    expect(registry.getBySource('jieba', organizationSource, 'org-b')).toBeUndefined()
    expect(registry.getBySource('missing', organizationSource, 'org-a')).toBeUndefined()
  })

  it('does not fall back to another source after the pinned plugin is removed', () => {
    registry.register('jieba', new TestAnalyzer(), tenantSource)
    registry.register('jieba', new TestAnalyzer(), organizationSource)

    registry.remove(tenantSource.scopeKey, '@example/jieba')

    expect(registry.get('jieba')).toBeDefined()
    expect(registry.getBySource('jieba', tenantSource)).toBeUndefined()
  })
})
