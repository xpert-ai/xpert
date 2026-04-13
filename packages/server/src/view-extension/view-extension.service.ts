import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ViewExtensionProviderRegistry } from '@xpert-ai/plugin-sdk'
import {
  XpertExtensionViewManifest,
  XpertResolvedViewHostContext,
  XpertViewActionRequest,
  XpertViewActionResult,
  XpertViewDataResult,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { ViewHostDefinitionRegistry } from './host-definition.registry'
import { ViewExtensionPermissionService } from './view-extension.permission.service'
import { ViewExtensionCacheService } from './view-extension.cache.service'
import {
  buildBaseViewHostContext,
  normalizeManifest,
  splitPublicViewKey,
  validateQuery
} from './view-extension.utils'

@Injectable()
export class ViewExtensionService {
  private readonly logger = new Logger(ViewExtensionService.name)

  constructor(
    private readonly providerRegistry: ViewExtensionProviderRegistry,
    private readonly hostDefinitionRegistry: ViewHostDefinitionRegistry,
    private readonly permissionService: ViewExtensionPermissionService,
    private readonly cacheService: ViewExtensionCacheService
  ) {}

  async listSlotViews(hostType: string, hostId: string, slot: string) {
    const context = await this.resolveHostContext(hostType, hostId)
    this.ensureSlotExists(context, slot)

    return this.cacheService.getOrSetSlotViews(context, slot, 60 * 1000, async () => {
      const manifests: XpertExtensionViewManifest[] = []

      for (const { providerKey, provider } of this.providerRegistry.listEntries(context.organizationId)) {
        try {
          if (!(await provider.supports(context))) {
            continue
          }

          const providerManifests = await provider.getViewManifests(context, slot)
          manifests.push(
            ...providerManifests.map((manifest) => normalizeManifest(manifest, providerKey, context, slot))
          )
        } catch (error) {
          this.logger.warn(
            `Failed to load view manifests for provider '${providerKey}': ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      return this.permissionService
        .filterVisibleManifests(manifests)
        .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    })
  }

  async getViewData(hostType: string, hostId: string, viewKey: string, query: XpertViewQuery) {
    const context = await this.resolveHostContext(hostType, hostId)
    const resolved = await this.resolveProviderManifest(context, viewKey)

    this.permissionService.ensureManifestVisible(resolved.manifest)
    validateQuery(query, resolved.manifest.dataSource)

    const cacheEnabled = resolved.manifest.dataSource.cache?.enabled !== false
    const ttlMs = Math.min(resolved.manifest.dataSource.cache?.ttlMs ?? 30 * 1000, 30 * 1000)

    if (!cacheEnabled) {
      return resolved.provider.getViewData(context, resolved.manifestKey, query)
    }

    return this.cacheService.getOrSetViewData(context, viewKey, query, ttlMs, () =>
      Promise.resolve(resolved.provider.getViewData(context, resolved.manifestKey, query))
    )
  }

  async executeAction(
    hostType: string,
    hostId: string,
    viewKey: string,
    actionKey: string,
    request: XpertViewActionRequest
  ) {
    const context = await this.resolveHostContext(hostType, hostId)
    const resolved = await this.resolveProviderManifest(context, viewKey)

    this.permissionService.ensureManifestVisible(resolved.manifest)

    const action = resolved.manifest.actions?.find((item) => item.key === actionKey)
    if (!action) {
      throw new NotFoundException(`Action '${actionKey}' was not found for view '${viewKey}'`)
    }
    this.permissionService.ensureActionVisible(action)

    if (!resolved.provider.executeViewAction) {
      throw new NotFoundException(`Action '${actionKey}' is not supported for view '${viewKey}'`)
    }

    const result = await Promise.resolve(
      resolved.provider.executeViewAction(context, resolved.manifestKey, actionKey, request)
    )

    if (result.refresh) {
      await this.cacheService.invalidateView(context, viewKey)
    }

    return result
  }

  private async resolveProviderManifest(context: XpertResolvedViewHostContext, publicViewKey: string) {
    const { providerKey, manifestKey } = splitPublicViewKey(publicViewKey)
    let provider = null
    try {
      provider = this.providerRegistry.get(providerKey, context.organizationId ?? undefined)
    } catch {
      throw new NotFoundException(`View provider '${providerKey}' was not found`)
    }

    if (!(await provider.supports(context))) {
      throw new NotFoundException(`View provider '${providerKey}' does not support this host`)
    }

    for (const slot of context.slots) {
      const manifests = await Promise.resolve(provider.getViewManifests(context, slot.key))
      for (const manifest of manifests) {
        if (manifest.key !== manifestKey) {
          continue
        }

        return {
          provider,
          manifestKey,
          manifest: normalizeManifest(manifest, providerKey, context, slot.key)
        }
      }
    }

    throw new NotFoundException(`View '${publicViewKey}' was not found`)
  }

  private async resolveHostContext(hostType: string, hostId: string) {
    const definition = this.hostDefinitionRegistry.get(hostType)
    if (!definition) {
      throw new NotFoundException(`Unknown view host '${hostType}'`)
    }

    const baseContext = buildBaseViewHostContext(hostType, hostId)
    const resolution = await Promise.resolve(definition.resolve(hostId))

    if (!resolution) {
      throw new NotFoundException(`View host '${hostType}:${hostId}' was not found`)
    }

    await this.permissionService.assertHostReadable(definition, baseContext, resolution)

    return {
      ...baseContext,
      workspaceId: resolution.workspaceId ?? null,
      hostSnapshot: resolution.hostSnapshot,
      slots: [...definition.slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
  }

  private ensureSlotExists(context: XpertResolvedViewHostContext, slot: string) {
    if (!context.slots.some((item) => item.key === slot)) {
      throw new NotFoundException(`Slot '${slot}' is not available for host '${context.hostType}'`)
    }
  }
}
