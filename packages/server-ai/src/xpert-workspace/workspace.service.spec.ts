import { BadRequestException, NotFoundException } from '@nestjs/common'
import { RequestContext, UserOrganizationService } from '@metad/server-core'
import { XpertWorkspaceService } from './workspace.service'

describe('XpertWorkspaceService', () => {
  let service: XpertWorkspaceService
  let userOrganizationService: {
    getCurrentUserDefaultWorkspaceId: jest.Mock
    setCurrentUserDefaultWorkspaceId: jest.Mock
  }

  beforeEach(() => {
    userOrganizationService = {
      getCurrentUserDefaultWorkspaceId: jest.fn(),
      setCurrentUserDefaultWorkspaceId: jest.fn()
    }

    service = new XpertWorkspaceService({} as any, userOrganizationService as unknown as UserOrganizationService)

    jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
      id: 'user-1',
      tenantId: 'tenant-1'
    } as any)
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the explicit default workspace when it is accessible', async () => {
    const workspace = { id: 'workspace-1' } as any
    userOrganizationService.getCurrentUserDefaultWorkspaceId.mockResolvedValue('workspace-1')
    jest.spyOn(service as any, 'findAccessibleWorkspaceForUser').mockResolvedValue(workspace)
    const legacySpy = jest.spyOn(service, 'findUserDefaultWorkspace').mockResolvedValue({ id: 'legacy' } as any)

    const result = await service.findMyDefault()

    expect(result).toBe(workspace)
    expect(legacySpy).not.toHaveBeenCalled()
  })

  it('falls back to the legacy user-default workspace when the explicit default is unavailable', async () => {
    const legacyWorkspace = { id: 'legacy-workspace' } as any
    userOrganizationService.getCurrentUserDefaultWorkspaceId.mockResolvedValue('workspace-1')
    jest.spyOn(service as any, 'findAccessibleWorkspaceForUser').mockResolvedValue(null)
    jest.spyOn(service, 'findUserDefaultWorkspace').mockResolvedValue(legacyWorkspace)

    const result = await service.findMyDefault()

    expect(result).toBe(legacyWorkspace)
  })

  it('stores the selected accessible workspace as the current default', async () => {
    const workspace = { id: 'workspace-1' } as any
    jest.spyOn(service as any, 'findAccessibleWorkspaceForUser').mockResolvedValue(workspace)

    const result = await service.setMyDefault('workspace-1')

    expect(userOrganizationService.setCurrentUserDefaultWorkspaceId).toHaveBeenCalledWith('workspace-1')
    expect(result).toBe(workspace)
  })

  it('rejects setting a default workspace outside organization scope', async () => {
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

    await expect(service.setMyDefault('workspace-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects setting a default workspace that is not accessible', async () => {
    jest.spyOn(service as any, 'findAccessibleWorkspaceForUser').mockResolvedValue(null)

    await expect(service.setMyDefault('workspace-1')).rejects.toBeInstanceOf(NotFoundException)
    expect(userOrganizationService.setCurrentUserDefaultWorkspaceId).not.toHaveBeenCalled()
  })
})
