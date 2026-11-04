import type { XpertExtensionViewManifest, XpertViewActionDefinition, XpertViewHostContext } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewExtensionPermissionService } from './view-extension.permission.service'

describe('ViewExtensionPermissionService Project access', () => {
	afterEach(() => jest.restoreAllMocks())

	it('enforces host-narrowed permissions on both discovery and direct invocation', () => {
		const service = new ViewExtensionPermissionService()
		const context: XpertViewHostContext = {
			...projectContext({ canRead: true, canEdit: true, canManage: true }),
			permissions: []
		}
		const action = { ...actions[0], permissions: ['XPERT_EDIT'] }
		const manifest: XpertExtensionViewManifest = {
			key: 'settings',
			title: { en_US: 'Settings' },
			permissions: ['XPERT_EDIT'],
			hostType: 'agent',
			slot: 'main',
			source: { provider: 'test' },
			view: { type: 'raw_json' },
			dataSource: { mode: 'platform' }
		}
		jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(true)
		expect(service.filterVisibleActions([action], context)).toEqual([])
		expect(service.filterVisibleManifests([manifest], context)).toEqual([])
		expect(() => service.ensureActionVisible(action, context)).toThrow(ForbiddenException)
		expect(() => service.ensureManifestVisible(manifest, context)).toThrow(ForbiddenException)
		context.permissions.push('XPERT_EDIT')
		expect(service.filterVisibleActions([action], context)).toEqual([action])
		expect(() => service.ensureActionVisible(action, context)).not.toThrow()
		jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(false)
		expect(() => service.ensureActionVisible(action, context)).toThrow(ForbiddenException)
	})

	it('keeps read actions and hides edit/manage actions for a read-only Project member', () => {
		const service = new ViewExtensionPermissionService()
		const context = projectContext({ canRead: true, canEdit: false, canManage: false })

		expect(service.filterVisibleActions(actions, context).map(({ key }) => key)).toEqual(['read'])
		expect(() => service.ensureActionVisible(actions[1], context)).toThrow(ForbiddenException)
	})

	it('allows editors to mutate documents but not manage sharing or permanent deletion', () => {
		const service = new ViewExtensionPermissionService()
		const context = projectContext({ canRead: true, canEdit: true, canManage: false })

		expect(service.filterVisibleActions(actions, context).map(({ key }) => key)).toEqual(['read', 'edit'])
	})
})

const actions: XpertViewActionDefinition[] = [
	{ key: 'read', label: { en_US: 'Read' }, actionType: 'invoke', requiredHostAccess: 'read' },
	{ key: 'edit', label: { en_US: 'Edit' }, actionType: 'invoke', requiredHostAccess: 'edit' },
	{ key: 'manage', label: { en_US: 'Manage' }, actionType: 'invoke', requiredHostAccess: 'manage' }
]

function projectContext(access: { canRead: boolean; canEdit: boolean; canManage: boolean }): XpertViewHostContext {
	return {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		hostType: 'project',
		hostId: 'project-1',
		runtimeScope: {
			projectId: 'project-1',
			conversationId: null,
			dataScopeKey: 'project:project-1',
			projectAccess: { role: 'member', canUse: true, ...access },
			workspaceFiles: { catalog: 'projects', scopeId: 'project-1', projectId: 'project-1' }
		}
	}
}
