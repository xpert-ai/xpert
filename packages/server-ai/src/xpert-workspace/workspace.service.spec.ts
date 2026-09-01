import { IUser } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
    PaginationParams,
    RequestContext,
    User,
    UserOrganization,
    UserOrganizationService
} from '@xpert-ai/server-core'
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
        create: jest.Mock
        save: jest.Mock
        delete: jest.Mock
        softRemove: jest.Mock
        recover: jest.Mock
    }
    let userRepository: {
        find: jest.Mock
    }
    let userOrganizationRepository: {
        find: jest.Mock
    }
    let workspaceAccessService: {
        findAccessibleWorkspaces: jest.Mock
        assertCanRead: jest.Mock
        assertCanAuthor: jest.Mock
        assertCanManage: jest.Mock
        buildAccess: jest.Mock
    }

    beforeEach(() => {
        userOrganizationService = {
            getCurrentUserDefaultWorkspaceId: jest.fn(),
            setCurrentUserDefaultWorkspaceId: jest.fn()
        }
        workspaceRepository = {
            create: jest.fn((workspace) => workspace),
            save: jest.fn(async (workspace: XpertWorkspace) => workspace),
            delete: jest.fn(),
            softRemove: jest.fn(),
            recover: jest.fn()
        }
        userRepository = {
            find: jest.fn()
        }
        userOrganizationRepository = {
            find: jest.fn()
        }
        workspaceAccessService = {
            findAccessibleWorkspaces: jest.fn(),
            assertCanRead: jest.fn(),
            assertCanAuthor: jest.fn(),
            assertCanManage: jest.fn(),
            buildAccess: jest.fn((workspace) => ({ workspace }))
        }

        service = new XpertWorkspaceService(
            workspaceRepository as unknown as Repository<XpertWorkspace>,
            userRepository as unknown as Repository<User>,
            userOrganizationRepository as unknown as Repository<UserOrganization>,
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

    it('passes authoring purpose to accessible workspace listing', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            name: 'Workspace'
        })
        workspaceAccessService.findAccessibleWorkspaces.mockResolvedValue([workspace])

        const options = { order: { updatedAt: 'DESC' } } as PaginationParams<XpertWorkspace>

        const result = await service.findAllMy(options, 'authoring')

        expect(workspaceAccessService.findAccessibleWorkspaces).toHaveBeenCalledWith(
            { updatedAt: 'DESC' },
            { purpose: 'authoring' }
        )
        expect(result.items).toHaveLength(1)
        expect(workspaceAccessService.buildAccess).toHaveBeenCalledWith(workspace)
    })

    it('creates a new workspace without accepting client identity, owner, or system fields', async () => {
        const input = {
            id: 'workspace-victim',
            name: 'Workspace',
            ownerId: 'user-victim',
            tenantId: 'tenant-victim',
            organizationId: 'org-victim',
            createdById: 'user-victim',
            settings: {
                access: { visibility: 'private' as const },
                system: { kind: 'tenant-default' as const }
            }
        }

        await service.createWorkspace(input)

        expect(workspaceRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Workspace',
                ownerId: 'user-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                settings: { access: { visibility: 'private' } }
            })
        )
        expect(workspaceRepository.create).toHaveBeenCalledWith(
            expect.not.objectContaining({
                id: 'workspace-victim',
                createdById: 'user-victim'
            })
        )
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

    it('ignores an explicit default workspace when it is not available for authoring', async () => {
        const legacyWorkspace = Object.assign(new XpertWorkspace(), {
            id: 'legacy-workspace',
            name: 'Legacy',
            status: 'active',
            ownerId: 'user-1'
        })
        const authoringWorkspace = { id: 'legacy-workspace', capabilities: { canWrite: true } }
        userOrganizationService.getCurrentUserDefaultWorkspaceId.mockResolvedValue('tenant-shared-workspace')
        workspaceAccessService.assertCanAuthor
            .mockRejectedValueOnce(new NotFoundException())
            .mockResolvedValueOnce({ workspace: authoringWorkspace })
        jest.spyOn(service, 'findUserDefaultWorkspace').mockResolvedValue(legacyWorkspace)

        const result = await service.findMyDefault('authoring')

        expect(result).toBe(authoringWorkspace)
        expect(workspaceAccessService.assertCanRead).not.toHaveBeenCalled()
        expect(workspaceAccessService.assertCanAuthor).toHaveBeenNthCalledWith(1, 'tenant-shared-workspace')
        expect(workspaceAccessService.assertCanAuthor).toHaveBeenNthCalledWith(2, 'legacy-workspace')
    })

    it('stores the selected accessible workspace as the current default', async () => {
        const workspace = { id: 'workspace-1' }
        workspaceAccessService.assertCanAuthor.mockResolvedValue({ workspace })

        const result = await service.setMyDefault('workspace-1')

        expect(workspaceAccessService.assertCanAuthor).toHaveBeenCalledWith('workspace-1')
        expect(userOrganizationService.setCurrentUserDefaultWorkspaceId).toHaveBeenCalledWith('workspace-1')
        expect(result).toBe(workspace)
    })

    it('rejects setting a default workspace outside organization scope', async () => {
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)

        await expect(service.setMyDefault('workspace-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('rejects setting a default workspace that is not accessible', async () => {
        workspaceAccessService.assertCanAuthor.mockRejectedValue(new NotFoundException())

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

        await expect(service.updateVisibility('workspace-1', 'tenant-shared')).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(workspaceRepository.save).not.toHaveBeenCalled()
    })

    it('updates only mutable workspace fields after manage authorization', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            name: 'Original',
            ownerId: 'owner-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })
        const input = {
            name: 'Renamed',
            ownerId: 'attacker',
            tenantId: 'attacker-tenant',
            organizationId: 'attacker-organization'
        }

        await service.updateWorkspace('workspace-1', input)

        expect(workspaceAccessService.assertCanManage).toHaveBeenCalledWith('workspace-1')
        expect(workspaceRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Renamed',
                ownerId: 'owner-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            })
        )
    })

    it('preserves system settings while allowing visibility updates', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            name: 'Original',
            tenantId: 'tenant-1',
            organizationId: null,
            settings: {
                system: {
                    kind: 'user-default' as const,
                    userId: 'owner-1'
                },
                access: {
                    visibility: 'private' as const
                }
            }
        })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })

        await service.updateWorkspace('workspace-1', {
            settings: {
                system: {
                    kind: 'tenant-default',
                    userId: 'attacker'
                },
                access: {
                    visibility: 'tenant-shared'
                }
            }
        })

        expect(workspaceRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: {
                    system: {
                        kind: 'user-default',
                        userId: 'owner-1'
                    },
                    access: {
                        visibility: 'tenant-shared'
                    }
                }
            })
        )
    })

    it('replaces organization workspace members only with active users from the same tenant and organization', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        const firstMember = Object.assign(new User(), { id: 'member-1', tenantId: 'tenant-1' })
        const secondMember = Object.assign(new User(), { id: 'member-2', tenantId: 'tenant-1' })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })
        userRepository.find.mockResolvedValue([secondMember, firstMember])
        userOrganizationRepository.find.mockResolvedValue([
            Object.assign(new UserOrganization(), { userId: 'member-1', isActive: true }),
            Object.assign(new UserOrganization(), { userId: 'member-2', isActive: true })
        ])
        workspaceAccessService.assertCanRead.mockResolvedValue({ workspace })

        const result = await service.updateMembers('workspace-1', ['member-1', 'member-2'])

        expect(userRepository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1'
            })
        })
        expect(userOrganizationRepository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                isActive: true
            })
        })
        expect(workspaceRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ members: [firstMember, secondMember] })
        )
        expect(result).toBe(workspace)
    })

    it('allows a same-tenant user in a tenant-level workspace without an organization membership', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: null
        })
        const member = Object.assign(new User(), { id: 'member-1', tenantId: 'tenant-1' })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })
        userRepository.find.mockResolvedValue([member])
        workspaceAccessService.assertCanRead.mockResolvedValue({ workspace })

        await expect(service.updateMembers('workspace-1', ['member-1'])).resolves.toBe(workspace)

        expect(userOrganizationRepository.find).not.toHaveBeenCalled()
        expect(workspaceRepository.save).toHaveBeenCalledWith(expect.objectContaining({ members: [member] }))
    })

    it('rejects a foreign-tenant workspace member before saving', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })
        userRepository.find.mockResolvedValue([])

        await expect(service.updateMembers('workspace-1', ['foreign-member'])).rejects.toThrow(
            'One or more workspace members are invalid.'
        )
        expect(userRepository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({ tenantId: 'tenant-1' })
        })
        expect(userOrganizationRepository.find).not.toHaveBeenCalled()
        expect(workspaceRepository.save).not.toHaveBeenCalled()
    })

    it('rejects a same-tenant user without active membership in the workspace organization before saving', async () => {
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        workspaceAccessService.assertCanManage.mockResolvedValue({ workspace })
        userRepository.find.mockResolvedValue([
            Object.assign(new User(), { id: 'wrong-org-member', tenantId: 'tenant-1' })
        ])
        userOrganizationRepository.find.mockResolvedValue([])

        await expect(service.updateMembers('workspace-1', ['wrong-org-member'])).rejects.toThrow(
            'One or more workspace members are invalid.'
        )
        expect(userOrganizationRepository.find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                isActive: true
            })
        })
        expect(workspaceRepository.save).not.toHaveBeenCalled()
    })

    it.each([
        ['update', () => service.updateWorkspace('victim-workspace', { name: 'Compromised' })],
        ['delete', () => service.deleteWorkspace('victim-workspace')],
        ['soft delete', () => service.softRemoveWorkspace('victim-workspace')],
        ['recover', () => service.recoverWorkspace('victim-workspace')]
    ])('rejects %s before mutating a workspace outside the caller access scope', async (_operation, invoke) => {
        workspaceAccessService.assertCanManage.mockRejectedValue(new ForbiddenException())

        await expect(invoke()).rejects.toBeInstanceOf(ForbiddenException)

        expect(workspaceRepository.save).not.toHaveBeenCalled()
        expect(workspaceRepository.delete).not.toHaveBeenCalled()
        expect(workspaceRepository.softRemove).not.toHaveBeenCalled()
        expect(workspaceRepository.recover).not.toHaveBeenCalled()
    })
})
