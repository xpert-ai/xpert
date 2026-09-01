import { PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext, User, UserOrganization } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectActivity } from '../entities/project-activity.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectMembershipService } from './project-membership.service'

describe('XpertProjectMembershipService Organization administrator intervention', () => {
    const actor = { id: 'admin-1', tenantId: 'tenant-1' }
    const project = {
        id: 'project-1',
        tenantId: actor.tenantId,
        organizationId: 'org-1',
        ownerId: 'owner-1'
    } as XpertProject
    const user = { id: actor.id, tenantId: actor.tenantId, type: UserType.USER } as User

    const membershipRepository = {
        findOne: jest.fn(),
        create: jest.fn((input) => input),
        save: jest.fn((input) => Promise.resolve(input)),
        restore: jest.fn()
    }
    const transactionalProjectRepository = {
        findOne: jest.fn(),
        save: jest.fn((input) => Promise.resolve(input))
    }
    const transactionalUserOrganizationRepository = {
        findOne: jest.fn()
    }
    const transactionalUserRepository = {
        findOne: jest.fn()
    }
    const activityRepository = {
        create: jest.fn((input) => input),
        save: jest.fn((input) => Promise.resolve(input))
    }
    const projectRepository = {
        findOne: jest.fn(),
        save: jest.fn((input) => Promise.resolve(input)),
        manager: {
            transaction: jest.fn(async (callback) =>
                callback({
                    getRepository: (entity) => {
                        if (entity === XpertProject) return transactionalProjectRepository
                        if (entity === XpertProjectMembership) return membershipRepository
                        if (entity === UserOrganization) return transactionalUserOrganizationRepository
                        if (entity === User) return transactionalUserRepository
                        if (entity === XpertProjectActivity) return activityRepository
                        throw new Error('Unexpected repository')
                    }
                })
            )
        }
    }

    const service = new XpertProjectMembershipService(
        membershipRepository as never,
        projectRepository as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as unknown as EventEmitter2
    )

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        transactionalProjectRepository.findOne.mockReset()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(actor as never)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(actor.id)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(project.organizationId)
        jest.spyOn(RequestContext, 'hasAnyPermission').mockReturnValue(true)
        transactionalProjectRepository.findOne
            .mockResolvedValueOnce(project)
            .mockResolvedValueOnce({ ...project, members: [] })
        transactionalUserOrganizationRepository.findOne.mockResolvedValue({
            tenantId: actor.tenantId,
            organizationId: project.organizationId,
            userId: actor.id,
            isActive: true
        })
        transactionalUserRepository.findOne.mockResolvedValue(user)
        membershipRepository.findOne.mockResolvedValue(null)
    })

    it('explicitly creates a manager membership and an actor-and-reason audit in one transaction', async () => {
        await expect(
            service.interveneAsOrganizationAdministrator(project.id, '  Incident INC-42  ')
        ).resolves.toMatchObject({
            projectId: project.id,
            userId: actor.id,
            role: 'manager'
        })

        expect(RequestContext.hasAnyPermission).toHaveBeenCalledWith([
            PermissionsEnum.ORG_USERS_EDIT,
            PermissionsEnum.ALL_ORG_EDIT
        ])
        expect(transactionalProjectRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: project.id,
                tenantId: actor.tenantId,
                organizationId: project.organizationId
            },
            lock: { mode: 'pessimistic_write' }
        })
        expect(transactionalUserOrganizationRepository.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: actor.tenantId,
                organizationId: project.organizationId,
                userId: actor.id,
                isActive: true
            }
        })
        expect(activityRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'project.admin-intervened',
                createdById: actor.id,
                payload: {
                    actorId: actor.id,
                    reason: 'Incident INC-42',
                    role: 'manager'
                }
            })
        )
        expect(transactionalProjectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ members: [user] }))
    })

    it('reactivates an old membership and promotes it to manager', async () => {
        const deletedAt = new Date('2026-08-01T00:00:00.000Z')
        const membership = {
            id: 'membership-1',
            projectId: project.id,
            userId: actor.id,
            role: 'member',
            joinedAt: new Date('2026-07-01T00:00:00.000Z'),
            removedAt: deletedAt,
            deletedAt
        } as XpertProjectMembership
        membershipRepository.findOne.mockResolvedValue(membership)

        await service.interveneAsOrganizationAdministrator(project.id, 'Operational recovery')

        expect(membershipRepository.restore).toHaveBeenCalledWith(membership.id)
        expect(membership).toMatchObject({
            role: 'manager',
            invitedById: actor.id,
            removedAt: undefined,
            deletedAt: undefined
        })
        expect(membership.joinedAt.getTime()).toBeGreaterThan(deletedAt.getTime())
    })

    it('rejects a caller without Organization user administration permission before touching the Project', async () => {
        jest.mocked(RequestContext.hasAnyPermission).mockReturnValue(false)

        await expect(service.interveneAsOrganizationAdministrator(project.id, 'Support case')).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(projectRepository.manager.transaction).not.toHaveBeenCalled()
    })

    it('requires a non-empty audited reason', async () => {
        await expect(service.interveneAsOrganizationAdministrator(project.id, '   ')).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(projectRepository.manager.transaction).not.toHaveBeenCalled()
    })

    it('rejects a Project outside the current tenant and Organization scope', async () => {
        transactionalProjectRepository.findOne.mockReset().mockResolvedValue(null)

        await expect(service.interveneAsOrganizationAdministrator(project.id, 'Support case')).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(transactionalUserOrganizationRepository.findOne).not.toHaveBeenCalled()
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(activityRepository.save).not.toHaveBeenCalled()
    })

    it('requires the administrator to be an active member of the Project Organization', async () => {
        transactionalUserOrganizationRepository.findOne.mockResolvedValue(null)

        await expect(service.interveneAsOrganizationAdministrator(project.id, 'Support case')).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(membershipRepository.save).not.toHaveBeenCalled()
        expect(activityRepository.save).not.toHaveBeenCalled()
    })
})
