import type { ProjectConfigurationApi } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ProjectConfigurationService } from '../project-configuration.service'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectMembershipService } from '../../services/project-membership.service'
import { XpertProjectInvitationService } from '../../services/project-invitation.service'
import { XpertProjectContentService } from '../../services/project-content.service'
import { XpertProjectService } from '../../project.service'
import { SkillRepositoryIndexService } from '../../../skill-repository/repository-index/skill-repository-index.service'

@Injectable()
export class ProjectConfigurationEditorsAdapter {
    constructor(private readonly access: XpertProjectAccessService, private readonly configurations: ProjectConfigurationService,
        private readonly members: XpertProjectMembershipService, private readonly invitations: XpertProjectInvitationService,
        private readonly content: XpertProjectContentService, private readonly projects: XpertProjectService,
        private readonly indexes: SkillRepositoryIndexService,
        @InjectRepository(UserOrganization) private readonly users: Repository<UserOrganization>) {}

    async get(projectId: string): ReturnType<ProjectConfigurationApi['get']> {
        return this.configurations.get(projectId)
    }
    async update(projectId: string, input: Parameters<ProjectConfigurationApi['update']>[1]): ReturnType<ProjectConfigurationApi['update']> {
        return this.configurations.update(projectId, input)
    }
    async listAvailableAssistants(projectId: string, input: Parameters<ProjectConfigurationApi['listAvailableAssistants']>[1]): ReturnType<ProjectConfigurationApi['listAvailableAssistants']> {
        const { page } = input
        const available = await this.projects.getAvailableXperts(projectId, { skip: (page - 1) * 20, take: 20 })
        return { items: available.items.map((item) => ({ id: item.id, name: item.title || item.name })), total: available.total, page }
    }
    async addAssistant(projectId: string, input: Parameters<ProjectConfigurationApi['addAssistant']>[1]): ReturnType<ProjectConfigurationApi['addAssistant']> {
        await this.access.assertCanManage(projectId)
        await this.projects.addXpert(projectId, input.xpertId)
        return null
    }
    async removeAssistant(projectId: string, input: Parameters<ProjectConfigurationApi['removeAssistant']>[1]): ReturnType<ProjectConfigurationApi['removeAssistant']> {
        await this.access.assertCanManage(projectId)
        await this.projects.removeXpert(projectId, input.xpertId)
        return null
    }
    async listMemberCandidates(projectId: string, input: Parameters<ProjectConfigurationApi['listMemberCandidates']>[1]): ReturnType<ProjectConfigurationApi['listMemberCandidates']> {
        const { project } = await this.access.assertCanManage(projectId)
        const { page, search } = input
        const query = this.users.createQueryBuilder('membership').innerJoinAndSelect('membership.user', 'user')
            .where('membership.tenantId = :tenantId AND membership.organizationId = :organizationId', project)
            .andWhere('membership.isActive = true AND user.deletedAt IS NULL AND user.type = :userType', { userType: UserType.USER })
        if (search) query.andWhere('(user.username ILIKE :search OR user.email ILIKE :search)', { search: `%${search}%` })
        const [rows, total] = await query.skip((page - 1) * 20).take(20).orderBy('user.id', 'ASC').getManyAndCount()
        const invites = await this.invitations.list(projectId)
        return { items: rows.map(({ user }) => ({ id: user.id, name: user.fullName || user.username || user.email })), total, page,
            canInvite: RequestContext.hasPermissions([PermissionsEnum.ORG_INVITE_EDIT]),
            invitations: invites.map((item) => ({ id: item.id, email: item.email, role: item.role, status: item.status })) }
    }
    async addMember(projectId: string, input: Parameters<ProjectConfigurationApi['addMember']>[1]): ReturnType<ProjectConfigurationApi['addMember']> {
        await this.members.add(projectId, input.userId, input.role ?? 'member')
        return null
    }
    async updateMemberRole(projectId: string, input: Parameters<ProjectConfigurationApi['updateMemberRole']>[1]): ReturnType<ProjectConfigurationApi['updateMemberRole']> {
        await this.members.updateRole(projectId, input.userId, input.role)
        return null
    }
    async removeMember(projectId: string, input: Parameters<ProjectConfigurationApi['removeMember']>[1]): ReturnType<ProjectConfigurationApi['removeMember']> {
        await this.members.remove(projectId, input.userId)
        return null
    }
    async transferOwnership(projectId: string, input: Parameters<ProjectConfigurationApi['transferOwnership']>[1]): ReturnType<ProjectConfigurationApi['transferOwnership']> {
        await this.members.transferOwnership(projectId, input.userId)
        return null
    }
    async inviteMember(projectId: string, input: Parameters<ProjectConfigurationApi['inviteMember']>[1]): ReturnType<ProjectConfigurationApi['inviteMember']> {
        await this.invitations.invite(projectId, input.email, input.role)
        return null
    }
    async revokeInvitation(projectId: string, input: Parameters<ProjectConfigurationApi['revokeInvitation']>[1]): ReturnType<ProjectConfigurationApi['revokeInvitation']> {
        const { invitationId } = input
        await this.invitations.revoke(projectId, invitationId)
        return null
    }
    async listSkillCatalog(projectId: string, input: Parameters<ProjectConfigurationApi['listSkillCatalog']>[1]): ReturnType<ProjectConfigurationApi['listSkillCatalog']> {
        await this.access.assertCanEdit(projectId)
        const { page, search } = input
        const result = await this.indexes.findMarketplace({ take: 20, skip: (page - 1) * 20 }, search)
        return { items: result.items.map((item) => ({ id: item.id, name: item.name || item.skillId, description: item.description })), total: result.total, page }
    }
    async installSkill(projectId: string, input: Parameters<ProjectConfigurationApi['installSkill']>[1]): ReturnType<ProjectConfigurationApi['installSkill']> {
        const { indexId } = input
        await this.content.installSkill(projectId, indexId)
        return null
    }
    async setSkillEnabled(projectId: string, input: Parameters<ProjectConfigurationApi['setSkillEnabled']>[1]): ReturnType<ProjectConfigurationApi['setSkillEnabled']> {
        await this.content.setSkillEnabled(projectId, input.skillId, input.enabled)
        return null
    }
    async removeSkill(projectId: string, input: Parameters<ProjectConfigurationApi['removeSkill']>[1]): ReturnType<ProjectConfigurationApi['removeSkill']> {
        const { skillId } = input
        await this.content.uninstallSkill(projectId, skillId)
        return null
    }
    async deleteProject(projectId: string, input: Parameters<ProjectConfigurationApi['deleteProject']>[1]): ReturnType<ProjectConfigurationApi['deleteProject']> {
        const { project } = await this.access.assertIsOwner(projectId)
        const { name } = input
        if (name !== project.name) throw new BadRequestException(t('server-ai:Error.ProjectTaskActionUnsupported'))
        await this.projects.deleteProject(projectId)
        return null
    }
}
