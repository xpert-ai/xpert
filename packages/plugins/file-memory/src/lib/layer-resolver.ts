import path from 'path'
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { MemoryAudienceEnum, MemoryScopeTypeEnum } from '@metad/contracts'
import { MEMORY_PATH_RESOLVER_TOKEN, type MemoryPathResolverLike } from './file-memory.registration'
import { MemoryAudience, MemoryLayer, MemoryLayerResolver, MemoryScope, MemoryScopeInput } from './types'

@Injectable()
export class DefaultMemoryLayerResolver implements MemoryLayerResolver {
  constructor(private readonly moduleRef: ModuleRef) {}

  resolveScope(xpert: MemoryScopeInput): MemoryScope {
    if (!xpert.id) {
      throw new Error('Memory scope resolution requires an xpert id.')
    }

    const scope: MemoryScope = {
      scopeType: MemoryScopeTypeEnum.XPERT,
      scopeId: xpert.id
    }

    if (xpert.workspaceId) {
      scope.parentScope = {
        scopeType: MemoryScopeTypeEnum.WORKSPACE,
        scopeId: xpert.workspaceId
      }
    }

    return scope
  }

  resolveVisibleLayers(scope: MemoryScope, userId: string, audience: MemoryAudience | 'all' = 'all'): MemoryLayer[] {
    const layers: MemoryLayer[] = []
    if (audience !== MemoryAudienceEnum.SHARED) {
      layers.push({
        scope,
        audience: MemoryAudienceEnum.USER,
        ownerUserId: userId,
        layerLabel: 'My Memory'
      })
    }
    if (audience !== MemoryAudienceEnum.USER) {
      layers.push({
        scope,
        audience: MemoryAudienceEnum.SHARED,
        layerLabel: 'Shared Memory'
      })
    }
    return layers
  }

  resolveLayerDirectory(tenantId: string, layer: MemoryLayer): string {
    const scopeDir = this.resolveScopeDirectory(tenantId, layer.scope)
    if (layer.audience === MemoryAudienceEnum.USER) {
      return path.join(scopeDir, 'users', layer.ownerUserId || 'unknown')
    }
    return path.join(scopeDir, 'shared')
  }

  resolveScopeDirectory(tenantId: string, scope: MemoryScope): string {
    const root = this.resolveScopeRoot(tenantId, scope)
    return path.join(root, '.xpert', 'memory', `${scope.scopeType}s`, scope.scopeId)
  }

  private resolveScopeRoot(tenantId: string, scope: MemoryScope): string {
    const paths = this.moduleRef.get<MemoryPathResolverLike>(MEMORY_PATH_RESOLVER_TOKEN, {
      strict: false
    })
    if (!paths) {
      throw new Error('Memory path resolver is unavailable.')
    }

    if (scope.scopeType === MemoryScopeTypeEnum.WORKSPACE) {
      return paths.getWorkspaceRootPath(tenantId, scope.scopeId)
    }

    if (scope.parentScope?.scopeType === MemoryScopeTypeEnum.WORKSPACE) {
      return paths.getWorkspaceRootPath(tenantId, scope.parentScope.scopeId)
    }

    return paths.getHostedRootPath(tenantId)
  }
}
