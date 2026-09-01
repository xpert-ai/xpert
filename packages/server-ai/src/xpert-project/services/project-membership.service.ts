import {
    PermissionsEnum,
    ScheduleTaskStatus,
    TXpertProjectMemberRole,
    TXpertProjectMemberSummary,
    UserType
} from '@xpert-ai/contracts'
import { RequestContext, User, UserOrganization, UserPublicDTO } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { XpertTask } from '../../xpert-task/xpert-task.entity'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectActivity } from '../entities/project-activity.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectAccessService } from './project-access.service'

@Injectable()
export class XpertProjectMembershipService {
    constructor(
        @InjectRepository(XpertProjectMembership)
        private readonly membershipRepository: Repository<XpertProjectMembership>,
        @InjectRepository(XpertProject) private readonly projectRepository: Repository<XpertProject>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(UserOrganization)
        private readonly userOrganizationRepository: Repository<UserOrganization>,
        @InjectRepository(XpertTask) private readonly taskRepository: Repository<XpertTask>,
        private readonly accessService: XpertProjectAccessService,
        private readonly eventEmitter: EventEmitter2
    ) {}

    async list(projectId: string): Promise<TXpertProjectMemberSummary[]> {
        const { project } = await this.accessService.assertCanRead(projectId)
        const [owner, memberships] = await Promise.all([
            this.userRepository.findOne({ where: { id: project.ownerId, tenantId: project.tenantId } }),
            this.membershipRepository.find({ where: { projectId }, relations: ['user'], order: { joinedAt: 'ASC' } })
        ])
        return [
            ...(owner ? [{ ...new UserPublicDTO(owner), projectRole: 'owner' as const }] : []),
            ...memberships.flatMap((membership) =>
                membership.user
                    ? [
                          {
                              ...new UserPublicDTO(membership.user),
                              membershipId: membership.id,
                              projectRole: membership.role,
                              joinedAt: membership.joinedAt
                          }
                      ]
                    : []
            )
        ]
    }

    async add(projectId: string, userId: string, role: TXpertProjectMemberRole = 'member') {
        const { project } = await this.accessService.assertCanManage(projectId)
        validateProjectMemberRole(role)
        if (project.ownerId === userId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectOwnerAlreadyMember', {
                    defaultValue: 'The Project owner already has full access'
                })
            )
        }
        const user = await this.userRepository.findOne({
            where: { id: userId, tenantId: project.tenantId, type: UserType.USER }
        })
        if (!user) {
            throw new NotFoundException(
                t('server-ai:Error.ProjectMemberNotFound', { defaultValue: 'The requested user was not found' })
            )
        }
        const organizationMembership = await this.userOrganizationRepository.findOne({
            where: {
                tenantId: project.tenantId,
                organizationId: project.organizationId ?? IsNull(),
                userId,
                isActive: true
            }
        })
        if (!organizationMembership) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectMemberOrganizationMismatch', {
                    defaultValue: 'The user must be an active member of the Project Organization'
                })
            )
        }

        let membership = await this.membershipRepository.findOne({
            where: { projectId, userId },
            withDeleted: true
        })
        if (membership) {
            if (membership.deletedAt) await this.membershipRepository.restore(membership.id)
            membership.role = role
            membership.joinedAt = new Date()
            membership.removedAt = undefined
            membership.deletedAt = undefined
        } else {
            membership = this.membershipRepository.create({
                projectId,
                userId,
                role,
                joinedAt: new Date(),
                invitedById: RequestContext.currentUserId(),
                tenantId: project.tenantId,
                organizationId: project.organizationId,
                createdById: RequestContext.currentUserId()
            })
        }
        const saved = await this.membershipRepository.save(membership)
        await this.addLegacyMember(project, user)
        return saved
    }

    async interveneAsOrganizationAdministrator(projectId: string, inputReason: string) {
        const actor = RequestContext.currentUser()
        if (!actor?.id || !actor.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }
        if (!RequestContext.hasAnyPermission([PermissionsEnum.ORG_USERS_EDIT, PermissionsEnum.ALL_ORG_EDIT])) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectAdminInterventionPermissionRequired', {
                    defaultValue:
                        'Organization user administration permission is required to intervene in this Project.'
                })
            )
        }

        const reason = typeof inputReason === 'string' ? inputReason.trim() : ''
        if (!reason) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectAdminInterventionInvalid', {
                    defaultValue: 'A non-empty reason is required for Project administrator intervention.'
                })
            )
        }

        const organizationId = RequestContext.getOrganizationId()
        if (!organizationId) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectNotAvailable', { defaultValue: 'The requested Project is not available' })
            )
        }

        const result = await this.projectRepository.manager.transaction(async (manager) => {
            const projectRepository = manager.getRepository(XpertProject)
            const membershipRepository = manager.getRepository(XpertProjectMembership)
            const userOrganizationRepository = manager.getRepository(UserOrganization)
            const userRepository = manager.getRepository(User)
            const activityRepository = manager.getRepository(XpertProjectActivity)
            const project = await projectRepository.findOne({
                where: { id: projectId, tenantId: actor.tenantId, organizationId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!project) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectNotAvailable', { defaultValue: 'The requested Project is not available' })
                )
            }

            const [organizationMembership, user] = await Promise.all([
                userOrganizationRepository.findOne({
                    where: {
                        tenantId: actor.tenantId,
                        organizationId,
                        userId: actor.id,
                        isActive: true
                    }
                }),
                userRepository.findOne({
                    where: { id: actor.id, tenantId: actor.tenantId, type: UserType.USER }
                })
            ])
            if (!organizationMembership || !user) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectAdminOrganizationMembershipRequired', {
                        defaultValue: 'The administrator must be an active member of the Project Organization.'
                    })
                )
            }
            if (project.ownerId === actor.id) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectOwnerAlreadyMember', {
                        defaultValue: 'The Project owner already has full access'
                    })
                )
            }

            let membership = await membershipRepository.findOne({
                where: { projectId, userId: actor.id },
                withDeleted: true,
                lock: { mode: 'pessimistic_write' }
            })
            if (membership) {
                const isReactivated = !!membership.deletedAt
                if (isReactivated) await membershipRepository.restore(membership.id)
                membership.role = 'manager'
                if (isReactivated) {
                    membership.joinedAt = new Date()
                    membership.invitedById = actor.id
                }
                membership.removedAt = undefined
                membership.deletedAt = undefined
            } else {
                membership = membershipRepository.create({
                    projectId,
                    userId: actor.id,
                    role: 'manager',
                    joinedAt: new Date(),
                    invitedById: actor.id,
                    tenantId: actor.tenantId,
                    organizationId,
                    createdById: actor.id
                })
            }
            const saved = await membershipRepository.save(membership)
            await activityRepository.save(
                activityRepository.create({
                    projectId,
                    tenantId: actor.tenantId,
                    organizationId,
                    type: 'project.admin-intervened',
                    summary: 'Organization administrator explicitly joined the Project',
                    entityType: 'project-membership',
                    entityId: saved.id,
                    payload: {
                        actorId: actor.id,
                        reason,
                        role: 'manager'
                    },
                    createdById: actor.id
                })
            )
            const compatible = await projectRepository.findOne({
                where: { id: projectId, tenantId: actor.tenantId, organizationId },
                relations: ['members']
            })
            if (compatible) {
                compatible.members ??= []
                if (!compatible.members.some((member) => member.id === actor.id)) {
                    compatible.members.push(user)
                    await projectRepository.save(compatible)
                }
            }
            return saved
        })
        return result
    }

    async updateRole(projectId: string, userId: string, role: TXpertProjectMemberRole) {
        await this.accessService.assertCanManage(projectId)
        validateProjectMemberRole(role)
        const membership = await this.membershipRepository.findOne({ where: { projectId, userId } })
        if (!membership) {
            throw new NotFoundException(
                t('server-ai:Error.ProjectMembershipNotFound', { defaultValue: 'Project membership was not found' })
            )
        }
        membership.role = role
        return this.membershipRepository.save(membership)
    }

    async transferOwnership(projectId: string, nextOwnerId: string) {
        const { project } = await this.accessService.assertIsOwner(projectId)
        const userId = nextOwnerId?.trim()
        if (!userId || userId === project.ownerId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectOwnerTransferTargetRequired', {
                    defaultValue: 'Select another active Project member as the new owner'
                })
            )
        }

        const previousOwnerId = project.ownerId
        const updated = await this.projectRepository.manager.transaction(async (manager) => {
            const projectRepository = manager.getRepository(XpertProject)
            const membershipRepository = manager.getRepository(XpertProjectMembership)
            const lockedProject = await projectRepository.findOne({
                where: { id: projectId, tenantId: project.tenantId },
                lock: { mode: 'pessimistic_write' }
            })
            const nextOwnerMembership = await membershipRepository.findOne({ where: { projectId, userId } })
            if (!lockedProject || !nextOwnerMembership) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectOwnerMustBeMember', {
                        defaultValue: 'The new owner must be an active Project member'
                    })
                )
            }

            nextOwnerMembership.removedAt = new Date()
            await membershipRepository.softRemove(nextOwnerMembership)

            let previousOwnerMembership = await membershipRepository.findOne({
                where: { projectId, userId: previousOwnerId },
                withDeleted: true
            })
            if (previousOwnerMembership) {
                if (previousOwnerMembership.deletedAt) {
                    await membershipRepository.restore(previousOwnerMembership.id)
                }
                previousOwnerMembership.role = 'manager'
                previousOwnerMembership.joinedAt = new Date()
                previousOwnerMembership.removedAt = undefined
                previousOwnerMembership.deletedAt = undefined
            } else {
                previousOwnerMembership = membershipRepository.create({
                    projectId,
                    userId: previousOwnerId,
                    role: 'manager',
                    joinedAt: new Date(),
                    invitedById: userId,
                    tenantId: project.tenantId,
                    organizationId: project.organizationId,
                    createdById: RequestContext.currentUserId()
                })
            }
            await membershipRepository.save(previousOwnerMembership)
            lockedProject.ownerId = userId
            return projectRepository.save(lockedProject)
        })

        await this.removeLegacyMember(project, userId)
        const previousOwner = await this.userRepository.findOne({ where: { id: previousOwnerId } })
        if (previousOwner) await this.addLegacyMember(updated, previousOwner)
        return updated
    }

    async remove(projectId: string, userId: string) {
        const { project } = await this.accessService.assertCanManage(projectId)
        if (project.ownerId === userId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectOwnerTransferRequired', {
                    defaultValue: 'Transfer Project ownership before removing the owner'
                })
            )
        }
        const membership = await this.membershipRepository.findOne({ where: { projectId, userId } })
        if (!membership) return
        membership.removedAt = new Date()
        await this.membershipRepository.softRemove(membership)
        await this.removeLegacyMember(project, userId)
        const pausedTaskState = {
            status: ScheduleTaskStatus.PAUSED,
            statusReason: t('server-ai:Error.ProjectTaskRunAsMembershipRemoved', {
                defaultValue: 'The run-as user is no longer a member of this Project'
            })
        }
        await Promise.all([
            this.taskRepository.update({ projectId, runAsUserId: userId }, pausedTaskState),
            this.taskRepository.update({ projectId, runAsUserId: IsNull(), createdById: userId }, pausedTaskState)
        ])
        await this.eventEmitter.emitAsync('xpert-project.member-removed', {
            tenantId: project.tenantId,
            organizationId: project.organizationId,
            projectId,
            userId,
            actorId: RequestContext.currentUserId()
        })
    }

    /** Compatibility bridge for the old PUT members endpoint. */
    async replaceMembers(projectId: string, userIds: string[]) {
        const current = await this.membershipRepository.find({ where: { projectId } })
        const desired = new Set(userIds)
        await Promise.all(
            current.filter((item) => !desired.has(item.userId)).map((item) => this.remove(projectId, item.userId))
        )
        for (const userId of desired) {
            await this.add(projectId, userId, current.find((item) => item.userId === userId)?.role ?? 'member')
        }
    }

    async syncLegacyMembership(projectId: string, userId: string) {
        const [project, user] = await Promise.all([
            this.projectRepository.findOne({ where: { id: projectId } }),
            this.userRepository.findOne({ where: { id: userId } })
        ])
        if (project && user) await this.addLegacyMember(project, user)
    }

    private async addLegacyMember(project: XpertProject, user: User) {
        const compatible = await this.projectRepository.findOne({ where: { id: project.id }, relations: ['members'] })
        if (!compatible) return
        compatible.members ??= []
        if (!compatible.members.some((member) => member.id === user.id)) {
            compatible.members.push(user)
            await this.projectRepository.save(compatible)
        }
    }

    private async removeLegacyMember(project: XpertProject, userId: string) {
        const compatible = await this.projectRepository.findOne({ where: { id: project.id }, relations: ['members'] })
        if (!compatible?.members) return
        compatible.members = compatible.members.filter((member) => member.id !== userId)
        await this.projectRepository.save(compatible)
    }
}

export function validateProjectMemberRole(role: string): asserts role is TXpertProjectMemberRole {
    if (!['manager', 'editor', 'member'].includes(role)) {
        throw new BadRequestException(
            t('server-ai:Error.InvalidProjectMemberRole', { defaultValue: 'Invalid Project member role' })
        )
    }
}
