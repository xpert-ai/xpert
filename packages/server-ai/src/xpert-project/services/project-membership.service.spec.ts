import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectMembershipService } from './project-membership.service'

describe('XpertProjectMembershipService', () => {
    const project = {
        id: 'project-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        ownerId: 'owner-1',
        members: []
    } as XpertProject

    const membershipRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn((input) => input),
        save: jest.fn((input) => Promise.resolve(input)),
        restore: jest.fn(),
        softRemove: jest.fn()
    }
    const projectRepository = {
        findOne: jest.fn(),
        save: jest.fn((input) => Promise.resolve(input)),
        manager: { transaction: jest.fn() }
    }
    const userRepository = {
        findOne: jest.fn()
    }
    const userOrganizationRepository = {
        findOne: jest.fn()
    }
    const accessService = {
        assertCanRead: jest.fn(),
        assertCanManage: jest.fn(),
        assertIsOwner: jest.fn()
    }
    let service: XpertProjectMembershipService

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('manager-1')
        accessService.assertCanManage.mockResolvedValue({ project, role: 'manager' })
        accessService.assertIsOwner.mockResolvedValue({ project, role: 'owner' })
        service = new XpertProjectMembershipService(
            membershipRepository as never,
            projectRepository as never,
            userRepository as never,
            userOrganizationRepository as never,
            accessService as never
        )
    })

    it('directly adds only an active same-Organization human user without sending notifications', async () => {
        const user = { id: 'user-2', tenantId: 'tenant-1', type: UserType.USER }
        jest.mocked(userRepository.findOne).mockResolvedValue(user)
        jest.mocked(userOrganizationRepository.findOne).mockResolvedValue({
            userId: user.id,
            organizationId: 'org-1',
            isActive: true
        })
        jest.mocked(membershipRepository.findOne).mockResolvedValue(null)
        jest.mocked(projectRepository.findOne).mockResolvedValue({ ...project, members: [] })

        await expect(service.add(project.id, user.id, 'editor')).resolves.toMatchObject({
            projectId: project.id,
            userId: user.id,
            role: 'editor',
            invitedById: 'manager-1'
        })

        expect(userRepository.findOne).toHaveBeenCalledWith({
            where: { id: user.id, tenantId: 'tenant-1', type: UserType.USER }
        })
        expect(userOrganizationRepository.findOne).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: user.id,
                isActive: true
            })
        })
    })

    it('rejects a human user who is not active in the Project Organization', async () => {
        jest.mocked(userRepository.findOne).mockResolvedValue({
            id: 'user-2',
            tenantId: 'tenant-1',
            type: UserType.USER
        })
        jest.mocked(userOrganizationRepository.findOne).mockResolvedValue(null)

        await expect(service.add(project.id, 'user-2')).rejects.toBeInstanceOf(BadRequestException)
        expect(membershipRepository.save).not.toHaveBeenCalled()
    })

    it('soft-removes a member and updates the legacy member relation', async () => {
        const membership = {
            id: 'membership-1',
            projectId: project.id,
            userId: 'user-2',
            role: 'member'
        } as XpertProjectMembership
        jest.mocked(membershipRepository.findOne).mockResolvedValue(membership)
        jest.mocked(projectRepository.findOne).mockResolvedValue({ ...project, members: [{ id: 'user-2' }] })

        await service.remove(project.id, 'user-2')

        expect(membership.removedAt).toBeInstanceOf(Date)
        expect(membershipRepository.softRemove).toHaveBeenCalledWith(membership)
        expect(projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ members: [] }))
    })

    it('transfers ownership only to an active member and demotes the previous owner to manager', async () => {
        const lockedProject = { ...project }
        const nextOwnerMembership = {
            id: 'membership-next',
            projectId: project.id,
            userId: 'user-2',
            role: 'manager'
        } as XpertProjectMembership
        const previousOwnerMembership = {
            id: 'membership-previous',
            projectId: project.id,
            userId: 'owner-1',
            role: 'member',
            deletedAt: new Date()
        } as XpertProjectMembership
        const transactionalProjectRepository = {
            findOne: jest.fn().mockResolvedValue(lockedProject),
            save: jest.fn((input) => Promise.resolve(input))
        }
        const transactionalMembershipRepository = {
            findOne: jest
                .fn()
                .mockResolvedValueOnce(nextOwnerMembership)
                .mockResolvedValueOnce(previousOwnerMembership),
            restore: jest.fn(),
            create: jest.fn((input) => input),
            save: jest.fn((input) => Promise.resolve(input)),
            softRemove: jest.fn()
        }
        jest.mocked(projectRepository.manager.transaction).mockImplementation(async (callback) =>
            callback({
                getRepository: (entity) =>
                    entity === XpertProject ? transactionalProjectRepository : transactionalMembershipRepository
            } as never)
        )
        jest.mocked(projectRepository.findOne)
            .mockResolvedValueOnce({ ...project, members: [{ id: 'user-2' }] })
            .mockResolvedValueOnce({ ...project, ownerId: 'user-2', members: [] })
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'owner-1' })

        await expect(service.transferOwnership(project.id, 'user-2')).resolves.toMatchObject({ ownerId: 'user-2' })

        expect(transactionalMembershipRepository.softRemove).toHaveBeenCalledWith(nextOwnerMembership)
        expect(transactionalMembershipRepository.restore).toHaveBeenCalledWith(previousOwnerMembership.id)
        expect(previousOwnerMembership).toMatchObject({ role: 'manager', removedAt: undefined, deletedAt: undefined })
        expect(lockedProject.ownerId).toBe('user-2')
    })
})
