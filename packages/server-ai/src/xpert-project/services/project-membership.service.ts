import { TXpertProjectMemberRole, TXpertProjectMemberSummary, UserType } from '@xpert-ai/contracts'
import { RequestContext, User, UserOrganization, UserPublicDTO } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
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
        private readonly accessService: XpertProjectAccessService
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
