import { IUser } from '@xpert-ai/contracts'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { RequestContext, UserOrganizationService } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceService } from './workspace.service'

describe('XpertWorkspaceService', () => {
  let service: XpertWorkspaceService
  let userOrganizationService: {
    getCurrentUserDefaultWorkspaceId: jest.Mock
    setCurrentUserDefaultWorkspaceId: jest.Mock
  }
  let workspaceRepository: {
    save: jest.Mock
  }
  let workspaceAccessService: {
    assertCanRead: jest.Mock
    assertCanManage: jest.Mock
    buildAccess: jest.Mock
  }

  beforeEach(() => {
    userOrganizationService = {
      getCurrentUserDefaultWorkspaceId: jest.fn(),
      setCurrentUserDefaultWorkspaceId: jest.fn()
    }
    workspaceRepository = {
      save: jest.fn(async (workspace: XpertWorkspace) => workspace)
    }
    workspaceAccessService = {
      assertCanRead: jest.fn(),
      assertCanManage: jest.fn(),
      buildAccess: jest.fn((workspace) => ({ workspace }))
    }

    service = new XpertWorkspaceService(
      workspaceRepository as unknown as Repository<XpertWorkspace>,
      userOrganizationService as unknown as UserOrganizationService,
      workspaceAccessService as unknown as XpertWorkspaceAccessService
    )

    jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
      id: 'user-1',
      tenantId: 'tenant-1'
    } as IUser)
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the explicit default workspace when it is accessible', async () => {
    const workspace = { id: 'workspace-1' }
    userOrganizationService.getCurrentUserDefaultWorkspaceId.mockResolvedValue('workspace-1')
    workspaceAccessService.assertCanRead.mockResolvedValue({ workspace })
    const legacySpy = jest.spyOn(service, 'findUserDefaultWorkspace').mockResolvedValue(
      Object.assign(new XpertWorkspace(), {
        id: 'legacy',
        name: 'Legacy',
        status: 'active',
        ownerId: 'user-1'
      })
    )

    const result = await service.findMyDefault()

    expect(result).toBe(workspace)
    expect(legacySpy).not.toHaveBeenCalled()
  })

  it('falls back to the legacy user-default workspace when the explicit default is unavailable', async () => {
    const legacyWorkspace = Object.assign(new XpertWorkspace(), {
      id: 'legacy-workspace',
      name: 'Legacy',
      status: 'active',
      ownerId: 'user-1'
    })
    userOrganizationService.getCurrentUserDefaultWorkspaceId.mockResolvedValue('workspace-1')
    workspaceAccessService.assertCanRead.mockRejectedValue(new NotFoundException())
    jest.spyOn(service, 'findUserDefaultWorkspace').mockResolvedValue(legacyWorkspace)

    const result = await service.findMyDefault()

    expect(result).toBe(legacyWorkspace)
  })

  it('stores the selected accessible workspace as the current default', async () => {
    const workspace = { id: 'workspace-1' }
    workspaceAccessService.assertCanRead.mockResolvedValue({ workspace })

    const result = await service.setMyDefault('workspace-1')

    expect(userOrganizationService.setCurrentUserDefaultWorkspaceId).toHaveBeenCalledWith('workspace-1')
    expect(result).toBe(workspace)
  })

  it('rejects setting a default workspace outside organization scope', async () => {
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

    await expect(service.setMyDefault('workspace-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects setting a default workspace that is not accessible', async () => {
    workspaceAccessService.assertCanRead.mockRejectedValue(new NotFoundException())

    await expect(service.setMyDefault('workspace-1')).rejects.toBeInstanceOf(NotFoundException)
    expect(userOrganizationService.setCurrentUserDefaultWorkspaceId).not.toHaveBeenCalled()
  })

  it('updates tenant-level workspace visibility and preserves other settings', async () => {
    const workspace = Object.assign(new XpertWorkspace(), {
      id: 'workspace-1',
      name: 'Tenant Workspace',
      organizationId: null,
      settings: {
        system: {
          kind: 'tenant-default'
        }
      }
    })
    workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })

    const result = await service.updateVisibility('workspace-1', 'tenant-shared')

    expect(workspaceAccessService.assertCanManage).toHaveBeenCalledWith('workspace-1')
    expect(workspaceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: {
          system: {
            kind: 'tenant-default'
          },
          access: {
            visibility: 'tenant-shared'
          }
        }
      })
    )
    expect(result.settings?.access?.visibility).toBe('tenant-shared')
    expect(result.settings?.system?.kind).toBe('tenant-default')
  })

  it('rejects tenant-shared visibility for organization workspaces', async () => {
    const workspace = Object.assign(new XpertWorkspace(), {
      id: 'workspace-1',
      name: 'Organization Workspace',
      organizationId: 'org-1'
    })
    workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })

    await expect(service.updateVisibility('workspace-1', 'tenant-shared')).rejects.toBeInstanceOf(BadRequestException)
    expect(workspaceRepository.save).not.toHaveBeenCalled()
  })
})
