import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    ProjectAccessRuntimeCapability,
    type ProjectAccessApi,
    type ProjectAccessActor,
    type ProjectHumanAccess
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { RuntimeCapabilityProvider } from '../../shared/runtime'

@Injectable()
@RuntimeCapabilityProvider(ProjectAccessRuntimeCapability)
export class ProjectAccessRuntimeService implements ProjectAccessApi {
    constructor(@InjectRepository(XpertProject) private readonly projects: Repository<XpertProject>) {}

    async listReadable(input: { actor: ProjectAccessActor; projectIds?: string[] }): Promise<ProjectHumanAccess[]> {
        const { actor, projectIds } = input
        if (!actor.tenantId || !actor.userId || projectIds?.length === 0) return []
        const query = this.projects
            .createQueryBuilder('project')
            .leftJoin(
                XpertProjectMembership,
                'membership',
                'membership.projectId = project.id AND membership.tenantId = project.tenantId AND membership.organizationId IS NOT DISTINCT FROM project.organizationId AND membership.userId = :userId AND membership.deletedAt IS NULL AND membership.removedAt IS NULL',
                { userId: actor.userId }
            )
            .where('project.tenantId = :tenantId', { tenantId: actor.tenantId })
            .andWhere(
                actor.organizationId ? 'project.organizationId = :organizationId' : 'project.organizationId IS NULL',
                { organizationId: actor.organizationId }
            )
            .andWhere('(project.ownerId = :userId OR membership.id IS NOT NULL)', { userId: actor.userId })
            .select('project.id', 'projectId')
            .addSelect('project.status', 'status')
            .addSelect("CASE WHEN project.ownerId = :userId THEN 'owner' ELSE membership.role END", 'role')
        if (projectIds) query.andWhere('project.id IN (:...projectIds)', { projectIds })
        const rows = await query.getRawMany<{ projectId: string; status: string; role: ProjectHumanAccess['role'] }>()
        const bindings = rows.length
            ? await this.projects
                  .createQueryBuilder('project')
                  .innerJoin('project.xperts', 'assistant')
                  .where('project.id IN (:...projectIds)', { projectIds: rows.map((row) => row.projectId) })
                  .andWhere('project.tenantId = :tenantId AND assistant.tenantId = :tenantId', {
                      tenantId: actor.tenantId
                  })
                  .select('project.id', 'projectId')
                  .addSelect('assistant.id', 'assistantId')
                  .getRawMany<{ projectId: string; assistantId: string }>()
            : []
        return rows.map((row) => ({
            assistantIds: bindings
                .filter((binding) => binding.projectId === row.projectId)
                .map((binding) => binding.assistantId),
            projectId: row.projectId,
            role: row.role,
            archived: row.status === 'archived',
            canManage: row.status !== 'archived' && ['owner', 'manager'].includes(row.role)
        }))
    }

    async assertManage(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess> {
        const access = (await this.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
        if (!access?.canManage) throw new ForbiddenException(t('server-ai:Error.ProjectManagerRequired'))
        return access
    }

    async assertEdit(input: { actor: ProjectAccessActor; projectId: string }): Promise<ProjectHumanAccess> {
        const access = (await this.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
        if (!access || access.archived || !['owner', 'manager', 'editor'].includes(access.role)) {
            throw new ForbiddenException(t('server-ai:Error.ProjectEditorRequired'))
        }
        return access
    }
}
