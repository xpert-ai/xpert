import { IUser, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'

describe('XpertWorkspaceAccessService', () => {
	let service: XpertWorkspaceAccessService

	beforeEach(() => {
		service = new XpertWorkspaceAccessService({} as unknown as Repository<XpertWorkspace>)

		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'user-1',
			tenantId: 'tenant-1',
			role: { name: RolesEnum.VIEWER }
		} as IUser)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('allows organization users to read and run tenant-shared workspaces without write access', () => {
		const workspace = Object.assign(new XpertWorkspace(), {
			id: 'workspace-1',
			tenantId: 'tenant-1',
			organizationId: null,
			ownerId: 'owner-1',
			settings: { access: { visibility: 'tenant-shared' } },
			members: []
		})

		expect(service.getCapabilities(workspace)).toEqual({
			canRead: true,
			canRun: true,
			canWrite: false,
			canManage: false
		})
	})

	it('keeps tenant-private workspaces hidden from organization scope users', () => {
		const workspace = Object.assign(new XpertWorkspace(), {
			id: 'workspace-1',
			tenantId: 'tenant-1',
			organizationId: null,
			ownerId: 'owner-1',
			settings: { access: { visibility: 'private' } },
			members: []
		})

		expect(service.getCapabilities(workspace).canRead).toBe(false)
	})

	it('allows tenant-scope owners to manage tenant-shared workspaces', () => {
		;(RequestContext.currentUser as jest.Mock).mockReturnValue({
			id: 'owner-1',
			tenantId: 'tenant-1',
			role: { name: RolesEnum.ADMIN }
		})
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
		;(RequestContext.isTenantScope as jest.Mock).mockReturnValue(true)

		const workspace = Object.assign(new XpertWorkspace(), {
			id: 'workspace-1',
			tenantId: 'tenant-1',
			organizationId: null,
			ownerId: 'owner-1',
			settings: { access: { visibility: 'tenant-shared' } },
			members: []
		})

		expect(service.getCapabilities(workspace)).toEqual({
			canRead: true,
			canRun: true,
			canWrite: true,
			canManage: true
		})
	})
})
