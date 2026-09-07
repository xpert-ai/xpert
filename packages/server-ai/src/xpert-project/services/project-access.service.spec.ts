import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

describe('XpertProjectAccessService', () => {
    const projectRepository = {
        findOne: jest.fn()
    } as unknown as Repository<XpertProject>
    const membershipRepository = {
        findOne: jest.fn()
    } as unknown as Repository<XpertProjectMembership>
    const xpertBindingService = {
        resolveCurrentById: jest.fn(),
        contains: jest.fn()
    }

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        xpertBindingService.resolveCurrentById.mockResolvedValue({ id: 'xpert-1' })
        xpertBindingService.contains.mockReturnValue(false)
    })

    it.each([
        ['user-1', 'archived', true],
        ['user-1', 'active', false],
        ['other', 'archived', false]
    ] as const)('restricts purge to archived project owners: %s %s', async (ownerId, status, allowed) => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId,
            status
        } as XpertProject)
        jest.mocked(membershipRepository.findOne).mockResolvedValue({ role: 'manager' } as XpertProjectMembership)
        const result = createService().assertCanPurge('project-1')
        if (allowed) await expect(result).resolves.toMatchObject({ role: 'owner' })
        else await expect(result).rejects.toBeInstanceOf(ForbiddenException)
        expect(projectRepository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'project-1', tenantId: 'tenant-1', organizationId: 'org-1' }
            })
        )
    })

    it('allows a manager to manage but rejects an editor', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1'
        } as XpertProject)
        jest.mocked(membershipRepository.findOne)
            .mockResolvedValueOnce({ role: 'manager' } as XpertProjectMembership)
            .mockResolvedValueOnce({ role: 'editor' } as XpertProjectMembership)
        const service = createService()

        await expect(service.assertCanManage('project-1')).resolves.toMatchObject({ role: 'manager' })
        await expect(service.assertCanManage('project-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('allows both an editor and the owner to edit Project basic configuration', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1'
        } as XpertProject)
        jest.mocked(membershipRepository.findOne).mockResolvedValue({ role: 'editor' } as XpertProjectMembership)
        const service = createService()

        await expect(service.assertCanEdit('project-1')).resolves.toMatchObject({ role: 'editor' })

        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-1')
        await expect(service.assertCanEdit('project-1')).resolves.toMatchObject({ role: 'owner' })
    })

    it('allows a member to read and use a linked Xpert but keeps the Project read-only', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1',
            status: 'active',
            xperts: [{ id: 'xpert-1' }]
        } as XpertProject)
        jest.mocked(membershipRepository.findOne).mockResolvedValue({ role: 'member' } as XpertProjectMembership)
        xpertBindingService.contains.mockReturnValue(true)
        const service = createService()

        await expect(service.assertCanRead('project-1')).resolves.toMatchObject({ role: 'member' })
        await expect(service.assertCanUseXpert('project-1', 'xpert-1')).resolves.toMatchObject({ role: 'member' })
        await expect(service.assertCanEdit('project-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.assertCanManage('project-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects users without an active membership', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1'
        } as XpertProject)
        jest.mocked(membershipRepository.findOne).mockResolvedValue(null)
        const service = createService()

        await expect(service.assertCanRead('project-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects a Project outside the current tenant or Organization without probing membership', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue(null)
        const service = createService()

        await expect(service.assertCanRead('project-1')).rejects.toBeInstanceOf(ForbiddenException)
        expect(projectRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'project-1', tenantId: 'tenant-1', organizationId: 'org-1' },
            relations: []
        })
        expect(membershipRepository.findOne).not.toHaveBeenCalled()
    })

    it('allows archived Projects to be read but not used or edited', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'user-1',
            status: 'archived',
            xperts: [{ id: 'xpert-1' }]
        } as XpertProject)
        const service = createService()

        await expect(service.assertCanRead('project-1')).resolves.toMatchObject({ role: 'owner' })
        await expect(service.assertCanUse('project-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.assertCanEdit('project-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('requires an explicit Project expert relation for runtime use', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'user-1',
            status: 'active',
            xperts: [{ id: 'xpert-2' }]
        } as XpertProject)
        const service = createService()

        await expect(service.assertCanUseXpert('project-1', 'xpert-1')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('treats a linked published version as the same Project expert', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'user-1',
            status: 'active',
            xperts: [{ id: 'xpert-v1' }]
        } as XpertProject)
        xpertBindingService.contains.mockReturnValue(true)
        const service = createService()

        await expect(service.assertCanUseXpert('project-1', 'xpert-current')).resolves.toMatchObject({
            role: 'owner'
        })
    })

    it('reserves owner-only operations for the Project owner', async () => {
        jest.mocked(projectRepository.findOne).mockResolvedValue({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ownerId: 'owner-1'
        } as XpertProject)
        jest.mocked(membershipRepository.findOne).mockResolvedValue({ role: 'manager' } as XpertProjectMembership)
        const service = createService()

        await expect(service.assertIsOwner('project-1')).rejects.toBeInstanceOf(ForbiddenException)

        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner-1')
        await expect(service.assertIsOwner('project-1')).resolves.toMatchObject({ role: 'owner' })
    })

    function createService() {
        return new XpertProjectAccessService(
            projectRepository,
            membershipRepository,
            xpertBindingService as unknown as XpertProjectXpertBindingService
        )
    }
})
