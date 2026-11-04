import { ForbiddenException, Injectable } from '@nestjs/common'
import { XpertExtensionViewManifest, XpertViewActionDefinition, XpertViewHostContext } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewHostDefinitionContract, ViewHostResolution, ViewHostResolutionOptions } from './host-definition.interface'

@Injectable()
export class ViewExtensionPermissionService {
	assertHostReadable(
		definition: ViewHostDefinitionContract,
		context: XpertViewHostContext,
		resolution: ViewHostResolution,
		options?: ViewHostResolutionOptions
	) {
		return Promise.resolve(definition.canRead(context, resolution, options)).then((readable) => {
			if (readable) {
				return
			}

			throw new ForbiddenException('No permission to access this view host')
		})
	}

	filterVisibleManifests(manifests: XpertExtensionViewManifest[], context?: XpertViewHostContext) {
		return manifests
			.filter((manifest) => manifest.visible !== false)
			.filter((manifest) => this.hasPermissions(manifest.permissions, context))
			.map((manifest) => ({
				...manifest,
				actions: this.filterVisibleActions(manifest.actions, context)
			}))
	}

	ensureManifestVisible(manifest: XpertExtensionViewManifest, context?: XpertViewHostContext) {
		if (manifest.visible === false || !this.hasPermissions(manifest.permissions, context)) {
			throw new ForbiddenException('No permission to access this extension view')
		}
	}

	filterVisibleActions(actions?: XpertViewActionDefinition[], context?: XpertViewHostContext) {
		return (
			actions?.filter(
				(action) =>
					this.hasPermissions(action.permissions, context) &&
					(!context || this.hasRequiredHostAccess(action, context))
			) ?? []
		)
	}

	ensureActionVisible(action: XpertViewActionDefinition | undefined, context?: XpertViewHostContext) {
		if (!action) {
			throw new ForbiddenException('No permission to access this extension action')
		}

		if (!this.hasPermissions(action.permissions, context)) {
			throw new ForbiddenException('No permission to access this extension action')
		}

		if (context && !this.hasRequiredHostAccess(action, context)) {
			throw new ForbiddenException('The current Project role does not allow this extension action')
		}
	}

	private hasRequiredHostAccess(action: XpertViewActionDefinition, context: XpertViewHostContext) {
		const required = action.requiredHostAccess
		if (!required || !context.runtimeScope?.projectId) return true

		const access = context.runtimeScope.projectAccess
		if (!access) return false
		if (required === 'read') return access.canRead
		if (required === 'edit') return access.canEdit
		return access.canManage
	}

	private hasPermissions(permissions?: string[], context?: XpertViewHostContext) {
		if (!permissions?.length) {
			return true
		}

		return (
			RequestContext.hasPermissions(permissions, false) &&
			(!context?.permissions || permissions.every((permission) => context.permissions.includes(permission)))
		)
	}
}
