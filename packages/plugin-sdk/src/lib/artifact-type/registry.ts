import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { ArtifactTypeBinding, ArtifactTypeReference } from '@xpert-ai/contracts'
import { BaseStrategyRegistry, resolveStrategyMetadataTarget, type StrategySource } from '../strategy'
import {
  BUILTIN_GLOBAL_SCOPE,
  GLOBAL_ORGANIZATION_SCOPE,
  SYSTEM_GLOBAL_SCOPE,
  getDefaultTenantId,
  getTenantGlobalScopeKey
} from '../types'
import { ARTIFACT_TYPE_PROVIDER, type IArtifactTypeProvider } from './index'
import { artifactTypeDefinitionSchema } from './definition.schema'

export const artifactTypeKey = (type: ArtifactTypeReference) => JSON.stringify([type.pluginName, type.resourceType])
export const FILE_ARTIFACT_TYPE: ArtifactTypeReference = { pluginName: '@xpert-ai/platform', resourceType: 'file' }

/** Bindings pin registration scope. Removal never falls back to a different installation or plain file. */
@Injectable()
export class ArtifactTypeRegistry extends BaseStrategyRegistry<IArtifactTypeProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(ARTIFACT_TYPE_PROVIDER, discovery, reflector)
  }

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const resourceType = target ? this.reflector.get<string>(ARTIFACT_TYPE_PROVIDER, target) : undefined
    if (!resourceType) return
    const provider = instance as IArtifactTypeProvider
    const source = this.getSource(provider)
    // Built-ins are explicitly composed by the host, never inferred from missing loader metadata.
    if (source.kind !== 'plugin') return
    this.register(artifactTypeKey({ pluginName: source.pluginName, resourceType }), provider, source)
  }

  registerBuiltin(type: ArtifactTypeReference, provider: IArtifactTypeProvider) {
    this.register(artifactTypeKey(type), provider, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
  }

  override assertCanRegister(key: string, provider: IArtifactTypeProvider, source: StrategySource) {
    if (
      !provider?.definition ||
      typeof provider.authorize !== 'function' ||
      typeof provider.validateContent !== 'function'
    )
      throw new Error('ARTIFACT_TYPE_INVALID')
    artifactTypeDefinitionSchema.parse(provider.definition)
    const identity: unknown = JSON.parse(key)
    if (
      !Array.isArray(identity) ||
      identity.length !== 2 ||
      identity.some((value) => typeof value !== 'string' || !value.trim())
    )
      throw new Error('ARTIFACT_TYPE_INVALID')
    if (source.kind === 'plugin' && (identity[0] !== source.pluginName || source.pluginName === '@xpert-ai/platform'))
      throw new Error('ARTIFACT_TYPE_NAMESPACE_DENIED')
    if (source.kind === 'plugin' && provider.snapshot?.kind === 'host')
      throw new Error('ARTIFACT_TYPE_HOST_VIEW_DENIED')
    if (provider.definition.presentation.mode === 'snapshot' && !provider.snapshot)
      throw new Error('ARTIFACT_TYPE_SNAPSHOT_REQUIRED')
    if (
      provider.snapshot &&
      (provider.definition.presentation.mode !== 'snapshot' ||
        typeof provider.snapshot.read !== 'function' ||
        (provider.snapshot.kind === 'plugin' && typeof provider.snapshot.getEntry !== 'function'))
    )
      throw new Error('ARTIFACT_TYPE_INVALID')
    const existing = this.strategies.get(source.scopeKey)?.get(key)
    if (existing && existing !== provider) {
      const owner = this.getSource(existing)
      if (
        owner.kind !== source.kind ||
        source.kind === 'builtin' ||
        (owner.kind === 'plugin' && source.kind === 'plugin' && owner.pluginName !== source.pluginName)
      )
        throw new Error('ARTIFACT_TYPE_CONFLICT')
    }
    for (const [scope, entries] of this.strategies) {
      if ([...entries.values()].includes(provider) && scope !== source.scopeKey)
        throw new Error('ARTIFACT_TYPE_SCOPE_CONFLICT')
    }
    super.assertCanRegister(key, provider, source)
  }

  bind(
    type: ArtifactTypeReference,
    scope: { tenantId?: string | null; organizationId?: string | null }
  ): ArtifactTypeBinding {
    if (!scope.tenantId) throw new Error('ARTIFACT_TYPE_SCOPE_REQUIRED')
    const tenantScope =
      scope.tenantId === getDefaultTenantId() ? GLOBAL_ORGANIZATION_SCOPE : getTenantGlobalScopeKey(scope.tenantId)
    const scopes = [
      ...new Set([scope.organizationId, tenantScope, SYSTEM_GLOBAL_SCOPE, BUILTIN_GLOBAL_SCOPE].filter(Boolean))
    ]
    const key = artifactTypeKey(type)
    for (const scopeKey of scopes) if (this.strategies.get(scopeKey)?.has(key)) return { ...type, scopeKey }
    throw new Error('ARTIFACT_TYPE_UNAVAILABLE')
  }

  hasType(type: ArtifactTypeReference, scope: { tenantId?: string | null; organizationId?: string | null }) {
    try {
      this.bind(type, scope)
      return true
    } catch {
      return false
    }
  }

  requireBinding(binding: ArtifactTypeBinding, scope: { tenantId?: string | null; organizationId?: string | null }) {
    if (!binding || !scope.tenantId) throw new Error('ARTIFACT_TYPE_UNAVAILABLE')
    const tenantScope =
      scope.tenantId === getDefaultTenantId() ? GLOBAL_ORGANIZATION_SCOPE : getTenantGlobalScopeKey(scope.tenantId)
    if (![scope.organizationId, tenantScope, SYSTEM_GLOBAL_SCOPE, BUILTIN_GLOBAL_SCOPE].includes(binding.scopeKey))
      throw new Error('ARTIFACT_TYPE_SCOPE_DENIED')
    const provider = this.strategies.get(binding.scopeKey)?.get(artifactTypeKey(binding))
    if (!provider) throw new Error('ARTIFACT_TYPE_UNAVAILABLE')
    return provider
  }
}
