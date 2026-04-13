import { ForbiddenException, Injectable } from '@nestjs/common'
import {
  XpertExtensionViewManifest,
  XpertViewActionDefinition,
  XpertViewHostContext
} from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { XpertViewHostDefinition, XpertViewHostResolution } from './host-definition.interface'

@Injectable()
export class ViewExtensionPermissionService {
  assertHostReadable(
    definition: XpertViewHostDefinition,
    context: XpertViewHostContext,
    resolution: XpertViewHostResolution
  ) {
    return Promise.resolve(definition.canRead(context, resolution)).then((readable) => {
      if (readable) {
        return
      }

      throw new ForbiddenException('No permission to access this view host')
    })
  }

  filterVisibleManifests(manifests: XpertExtensionViewManifest[]) {
    return manifests
      .filter((manifest) => manifest.visible !== false)
      .filter((manifest) => this.hasPermissions(manifest.permissions))
      .map((manifest) => ({
        ...manifest,
        actions: this.filterVisibleActions(manifest.actions)
      }))
  }

  ensureManifestVisible(manifest: XpertExtensionViewManifest) {
    if (manifest.visible === false || !this.hasPermissions(manifest.permissions)) {
      throw new ForbiddenException('No permission to access this extension view')
    }
  }

  filterVisibleActions(actions?: XpertViewActionDefinition[]) {
    return actions?.filter((action) => this.hasPermissions(action.permissions)) ?? []
  }

  ensureActionVisible(action: XpertViewActionDefinition | undefined) {
    if (!action) {
      throw new ForbiddenException('No permission to access this extension action')
    }

    if (!this.hasPermissions(action.permissions)) {
      throw new ForbiddenException('No permission to access this extension action')
    }
  }

  private hasPermissions(permissions?: string[]) {
    if (!permissions?.length) {
      return true
    }

    return RequestContext.hasPermissions(permissions, false)
  }
}
