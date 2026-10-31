import 'reflect-metadata'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { ArtifactTypeProvider, ArtifactTypeRegistry, artifactTypeKey, type IArtifactTypeProvider } from './index'
import {
  BUILTIN_GLOBAL_SCOPE,
  PLUGIN_METADATA_KEY,
  ORGANIZATION_METADATA_KEY,
  STRATEGY_META_KEY,
  SYSTEM_GLOBAL_SCOPE,
  getTenantGlobalScopeKey
} from '../types'
import { StrategyBus } from '../core/strategy-bus'

const type = { pluginName: '@example/reports', resourceType: 'report' }
const scope = { tenantId: 'tenant-a', organizationId: 'org-a' }
const plugin = (scopeKey = scope.organizationId) => ({ kind: 'plugin' as const, pluginName: type.pluginName, scopeKey })
const provider = (): IArtifactTypeProvider => ({
  definition: { kinds: ['file'], presentation: { mode: 'file' } },
  authorize: async () => {},
  validateContent: () => {}
})
const registry = () =>
  new ArtifactTypeRegistry({ getProviders: () => [] } as unknown as DiscoveryService, new Reflector())

describe('Artifact type extension protocol', () => {
  it('accepts application-managed draft types', () => {
    const p = provider()
    p.definition.versioning = { mode: 'draft-only' }
    expect(() => registry().register(artifactTypeKey(type), p, plugin())).not.toThrow()
  })
  it('derives plugin identity from loader metadata and participates in removal events', () => {
    @ArtifactTypeProvider('report')
    class ReportType implements IArtifactTypeProvider {
      readonly definition = provider().definition
      async authorize() {}
      validateContent() {}
    }
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, type.pluginName, ReportType)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope.organizationId, ReportType)
    const bus = new StrategyBus()
    const r = registry()
    Object.defineProperty(r, 'bus', { value: bus })
    r.onModuleInit()
    const instance = new ReportType()
    bus.upsert(Reflect.getMetadata(STRATEGY_META_KEY, ReportType), { instance, sourceId: 'test', sourceKind: 'plugin' })
    const binding = r.bind(type, scope)
    expect(r.requireBinding(binding, scope)).toBe(instance)
    bus.remove(scope.organizationId, type.pluginName)
    expect(() => r.requireBinding(binding, scope)).toThrow('UNAVAILABLE')
  })
  it('pins the installation and never falls back after uninstall or restart', () => {
    const r = registry()
    r.register(artifactTypeKey(type), provider(), plugin(SYSTEM_GLOBAL_SCOPE))
    r.register(artifactTypeKey(type), provider(), plugin())
    const binding = r.bind(type, scope)
    r.remove(scope.organizationId, type.pluginName)
    expect(() => r.requireBinding(binding, scope)).toThrow('UNAVAILABLE')
    expect(() => registry().requireBinding(binding, scope)).toThrow('UNAVAILABLE')
    expect(r.bind(type, scope).scopeKey).toBe(SYSTEM_GLOBAL_SCOPE)
  })
  it('resolves tenant scope from the artifact, including anonymous reads without ambient identity', () => {
    const r = registry()
    const p = provider()
    r.register(artifactTypeKey(type), p, plugin(getTenantGlobalScopeKey(scope.tenantId)))
    const binding = r.bind(type, scope)
    expect(r.requireBinding(binding, scope)).toBe(p)
    expect(() => r.requireBinding(binding, { tenantId: 'tenant-b', organizationId: 'org-b' })).toThrow('SCOPE_DENIED')
    expect(() => r.bind(type, { organizationId: scope.organizationId })).toThrow('SCOPE_REQUIRED')
  })
  it('rejects namespace forgery, built-in overrides, and instance reuse across installations', () => {
    const r = registry()
    const p = provider()
    expect(() => r.register(artifactTypeKey(type), p, { ...plugin(), pluginName: 'other' })).toThrow('NAMESPACE_DENIED')
    expect(() =>
      r.register(artifactTypeKey({ ...type, pluginName: '@xpert-ai/platform' }), p, {
        ...plugin(),
        pluginName: '@xpert-ai/platform'
      })
    ).toThrow('NAMESPACE_DENIED')
    r.register(artifactTypeKey(type), p, plugin())
    expect(() => r.register(artifactTypeKey(type), p, plugin('other-org'))).toThrow('SCOPE_CONFLICT')
  })
  it('allows built-in contributions through explicit composition and rejects duplicates', () => {
    const r = registry()
    const p = provider()
    r.registerBuiltin(type, p)
    expect(r.bind(type, scope).scopeKey).toBe(BUILTIN_GLOBAL_SCOPE)
    expect(() => r.registerBuiltin(type, provider())).toThrow('CONFLICT')
  })
  it('rejects malformed definitions and plugin claims to host-only renderers', () => {
    const r = registry()
    expect(() =>
      r.register(
        artifactTypeKey(type),
        { ...provider(), definition: { kinds: [], presentation: { mode: 'file' } } },
        plugin()
      )
    ).toThrow()
    expect(() =>
      r.register(
        artifactTypeKey(type),
        { ...provider(), definition: { kinds: ['file'], presentation: { mode: 'snapshot' } } },
        plugin()
      )
    ).toThrow('SNAPSHOT_REQUIRED')
    expect(() =>
      r.register(artifactTypeKey(type), { ...provider(), snapshot: { kind: 'host', read: async () => ({}) } }, plugin())
    ).toThrow('HOST_VIEW_DENIED')
  })
  it('supports an independently loaded SDK decorator through stable metadata keys', () => {
    let ForeignDecorator: typeof ArtifactTypeProvider
    jest.isolateModules(() => {
      ForeignDecorator = require('./index').ArtifactTypeProvider
    })
    class ForeignType {
      readonly definition = provider().definition
      async authorize() {}
      validateContent() {}
    }
    ForeignDecorator!('report')(ForeignType)
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, type.pluginName, ForeignType)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope.organizationId, ForeignType)
    const r = registry(),
      p = new ForeignType()
    r.upsert(p)
    expect(r.requireBinding(r.bind(type, scope), scope)).toBe(p)
  })
})
