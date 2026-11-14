// Revalidate trusted execution identity and project access per call; never cache scope on a singleton.
import { Injectable, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import type { ProjectConfigurationOverview } from '@xpert-ai/contracts'
import {
    RequestContext, RuntimeCapabilityProvider, ProjectConfigurationRuntimeCapability,
    type ProjectConfigurationApi, type ProjectConfigurationScope, type ProjectSkillArchive
} from '@xpert-ai/plugin-sdk'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectContentService } from '../../services/project-content.service'
import { XpertProjectMembershipService } from '../../services/project-membership.service'
import { ProjectConfigurationService } from '../project-configuration.service'
import { XpertProjectService } from '../../project.service'
import { XpertTask } from '../../../xpert-task/xpert-task.entity'
import { ProjectConfigurationEditorsAdapter } from './project-configuration-editors.adapter'
import { ProjectConfigurationAutomationAdapter } from './project-configuration-automation.adapter'
import { ProjectConfigurationConnectorsAdapter } from './project-configuration-connectors.adapter'

@Injectable()
@RuntimeCapabilityProvider(ProjectConfigurationRuntimeCapability)
export class ProjectConfigurationRuntimeService implements ProjectConfigurationApi {
    constructor(
        private readonly access: XpertProjectAccessService,
        private readonly content: XpertProjectContentService,
        private readonly members: XpertProjectMembershipService,
        private readonly configurations: ProjectConfigurationService,
        private readonly projects: XpertProjectService,
        private readonly editors: ProjectConfigurationEditorsAdapter,
        @Inject(forwardRef(() => ProjectConfigurationAutomationAdapter)) private readonly automations: ProjectConfigurationAutomationAdapter,
        private readonly connectors: ProjectConfigurationConnectorsAdapter,
        @InjectRepository(XpertTask) private readonly tasks: Repository<XpertTask>
    ) {}

    private async resolve(scope: ProjectConfigurationScope) {
        const { projectId, actor, assistantId } = scope
        // Domain services use RequestContext: the host must restore the same trusted execution identity.
        if (
            !projectId ||
            !actor?.tenantId ||
            !actor.userId ||
            actor.userId !== RequestContext.currentUserId() ||
            actor.tenantId !== RequestContext.currentTenantId() ||
            (actor.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null)
        )
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskContextRequired'))
        const access =
            assistantId !== undefined
                ? await this.access.assertCanUseXpert(projectId, assistantId)
                : await this.access.assertCanRead(projectId)
        if (access.role === 'assistant') throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        return { ...access, projectId }
    }

    async getOverview(scope: ProjectConfigurationScope) {
        const { projectId, project, role } = await this.resolve(scope)
        const { actor } = scope
        const [configuration, instruction, skills, members, experts, [automations, automationTotal]] =
            await Promise.all([
                this.configurations.get(projectId),
                this.content.readInstructions(projectId),
                this.content.listSkills(projectId),
                this.members.list(projectId),
                this.projects.getXperts(projectId, { take: 100, skip: 0, where: {}, order: {}, withDeleted: false }),
                this.tasks.findAndCount({
                    where: {
                        projectId,
                        tenantId: actor.tenantId,
                        organizationId: actor.organizationId ?? IsNull()
                    },
                    select: ['id', 'name', 'prompt', 'monitor', 'schedule', 'options', 'status'],
                    order: { updatedAt: 'DESC' },
                    take: 20
                })
            ])
        const writable = project.status !== 'archived'
        const item: ProjectConfigurationOverview = {
            projectId,
            name: project.name,
            userId: actor.userId,
            canEdit: writable && role !== 'member',
            canManage: writable && ['owner', 'manager'].includes(role),
            isOwner: writable && role === 'owner',
            applicationManaged: project.projectTypeSnapshot?.binding.kind === 'entity',
            instruction: instruction.content,
            ...configuration.taskExecution,
            experts: experts.items.map((xpert) => ({ id: xpert.id, name: xpert.title || xpert.name })),
            members: members.map((member) => ({
                id: member.id,
                role: member.projectRole,
                name:
                    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                    member.username ||
                    member.email ||
                    member.id
            })),
            skills: skills.items.map(({ id, name, description, enabled }) => ({ id, name, description, enabled })),
            automations: automations.map((task) => ({
                id: task.id,
                name: task.name || task.prompt || '',
                schedule: task.scheduleDescription || '',
                status: task.status || ''
            })),
            automationTotal
        }
        return item
    }

    async get(scope: ProjectConfigurationScope): ReturnType<ProjectConfigurationApi['get']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.get(projectId)
    }
    async update(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['update']>[1]): ReturnType<ProjectConfigurationApi['update']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.update(projectId, input)
    }
    async listAvailableAssistants(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['listAvailableAssistants']>[1]): ReturnType<ProjectConfigurationApi['listAvailableAssistants']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.listAvailableAssistants(projectId, input)
    }
    async addAssistant(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['addAssistant']>[1]): ReturnType<ProjectConfigurationApi['addAssistant']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.addAssistant(projectId, input)
    }
    async removeAssistant(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['removeAssistant']>[1]): ReturnType<ProjectConfigurationApi['removeAssistant']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.removeAssistant(projectId, input)
    }
    async listMemberCandidates(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['listMemberCandidates']>[1]): ReturnType<ProjectConfigurationApi['listMemberCandidates']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.listMemberCandidates(projectId, input)
    }
    async addMember(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['addMember']>[1]): ReturnType<ProjectConfigurationApi['addMember']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.addMember(projectId, input)
    }
    async updateMemberRole(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['updateMemberRole']>[1]): ReturnType<ProjectConfigurationApi['updateMemberRole']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.updateMemberRole(projectId, input)
    }
    async removeMember(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['removeMember']>[1]): ReturnType<ProjectConfigurationApi['removeMember']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.removeMember(projectId, input)
    }
    async transferOwnership(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['transferOwnership']>[1]): ReturnType<ProjectConfigurationApi['transferOwnership']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.transferOwnership(projectId, input)
    }
    async inviteMember(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['inviteMember']>[1]): ReturnType<ProjectConfigurationApi['inviteMember']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.inviteMember(projectId, input)
    }
    async revokeInvitation(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['revokeInvitation']>[1]): ReturnType<ProjectConfigurationApi['revokeInvitation']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.revokeInvitation(projectId, input)
    }
    async listSkillCatalog(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['listSkillCatalog']>[1]): ReturnType<ProjectConfigurationApi['listSkillCatalog']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.listSkillCatalog(projectId, input)
    }
    async installSkill(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['installSkill']>[1]): ReturnType<ProjectConfigurationApi['installSkill']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.installSkill(projectId, input)
    }
    async setSkillEnabled(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['setSkillEnabled']>[1]): ReturnType<ProjectConfigurationApi['setSkillEnabled']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.setSkillEnabled(projectId, input)
    }
    async removeSkill(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['removeSkill']>[1]): ReturnType<ProjectConfigurationApi['removeSkill']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.removeSkill(projectId, input)
    }
    async deleteProject(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['deleteProject']>[1]): ReturnType<ProjectConfigurationApi['deleteProject']> {
        const { projectId } = await this.resolve(scope)
        return this.editors.deleteProject(projectId, input)
    }
    async listAutomations(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['listAutomations']>[1]): ReturnType<ProjectConfigurationApi['listAutomations']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.listAutomations(projectId, input)
    }
    async getAutomationOptions(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['getAutomationOptions']>[1]): ReturnType<ProjectConfigurationApi['getAutomationOptions']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.getAutomationOptions(projectId, input)
    }
    async saveAutomation(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['saveAutomation']>[1]): ReturnType<ProjectConfigurationApi['saveAutomation']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.saveAutomation(projectId, input)
    }
    async pauseAutomation(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['pauseAutomation']>[1]): ReturnType<ProjectConfigurationApi['pauseAutomation']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.pauseAutomation(projectId, input)
    }
    async resumeAutomation(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['resumeAutomation']>[1]): ReturnType<ProjectConfigurationApi['resumeAutomation']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.resumeAutomation(projectId, input)
    }
    async deleteAutomation(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['deleteAutomation']>[1]): ReturnType<ProjectConfigurationApi['deleteAutomation']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.deleteAutomation(projectId, input)
    }
    async proposeAutomationRunAs(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['proposeAutomationRunAs']>[1]): ReturnType<ProjectConfigurationApi['proposeAutomationRunAs']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.proposeAutomationRunAs(projectId, input)
    }
    async acceptAutomationRunAs(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['acceptAutomationRunAs']>[1]): ReturnType<ProjectConfigurationApi['acceptAutomationRunAs']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.acceptAutomationRunAs(projectId, input)
    }
    async updateAutomationConnectors(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['updateAutomationConnectors']>[1]): ReturnType<ProjectConfigurationApi['updateAutomationConnectors']> {
        const { projectId } = await this.resolve(scope)
        return this.automations.updateAutomationConnectors(projectId, input)
    }
    async listConnectors(scope: ProjectConfigurationScope): ReturnType<ProjectConfigurationApi['listConnectors']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.listConnectors(projectId)
    }
    async addConnector(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['addConnector']>[1]): ReturnType<ProjectConfigurationApi['addConnector']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.addConnector(projectId, input)
    }
    async removeConnector(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['removeConnector']>[1]): ReturnType<ProjectConfigurationApi['removeConnector']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.removeConnector(projectId, input)
    }
    async getConnectorAuthorizationStatus(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['getConnectorAuthorizationStatus']>[1]): ReturnType<ProjectConfigurationApi['getConnectorAuthorizationStatus']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.getConnectorAuthorizationStatus(projectId, input)
    }
    async cancelConnectorAuthorization(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['cancelConnectorAuthorization']>[1]): ReturnType<ProjectConfigurationApi['cancelConnectorAuthorization']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.cancelConnectorAuthorization(projectId, input)
    }
    async connectConnector(scope: ProjectConfigurationScope, input: Parameters<ProjectConfigurationApi['connectConnector']>[1]): ReturnType<ProjectConfigurationApi['connectConnector']> {
        const { projectId } = await this.resolve(scope)
        return this.connectors.connectConnector(projectId, input)
    }
    async updateInstructions(scope: ProjectConfigurationScope, content: string) {
        const { projectId } = await this.resolve(scope)
        await this.content.updateInstructions(projectId, content)
    }
    async uploadSkill(scope: ProjectConfigurationScope, file: ProjectSkillArchive) {
        const { projectId } = await this.resolve(scope)
        if (file.buffer.length > 25 * 1024 * 1024)
            throw new BadRequestException(t('server-ai:Error.ProjectSkillArchiveRequired'))
        await this.content.uploadSkills(projectId, file)
    }
}
