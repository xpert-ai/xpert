// Configuration lives separately from Project so ordinary Project saves cannot overwrite it.
// Resolve authorization/schema/policy before locking; writes use short transactions and revision CAS.
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { GENERAL_PROJECT_TYPE, type ProjectConfigurationUpdate, type XpertProjectConfigurationView,
    type ProjectTaskDurationConfiguration, type XpertProjectTypeRef } from '@xpert-ai/contracts'
import { RequestContext, type ProjectAccessActor } from '@xpert-ai/plugin-sdk'
import { ModelExecutionPolicyService } from '../../model-execution/execution-policy'
import { resolveExecutionDuration } from '../../model-execution/execution-duration'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectAccessService } from '../services/project-access.service'
import { ProjectAccessRuntimeService } from '../services/project-access-runtime.service'
import { XpertProjectTypeService } from '../services/project-type.service'
import { XpertProjectConfiguration } from './project-configuration.entity'
import { configurationInvalid, effectiveProjectConfiguration } from './project-configuration.schema'

@Injectable()
export class ProjectConfigurationService {
    constructor(
        @InjectRepository(XpertProjectConfiguration) private readonly configurations: Repository<XpertProjectConfiguration>,
        private readonly access: XpertProjectAccessService,
        private readonly runtimeAccess: ProjectAccessRuntimeService,
        private readonly types: XpertProjectTypeService,
        private readonly policies: ModelExecutionPolicyService
    ) {}

    private ref(project: { applicationKey?: string | null; projectTypeKey?: string | null }): XpertProjectTypeRef {
        return project.applicationKey && project.projectTypeKey
            ? { applicationKey: project.applicationKey, projectTypeKey: project.projectTypeKey } : GENERAL_PROJECT_TYPE
    }

    private where(projectId: string, actor: { tenantId?: string; organizationId?: string | null }) {
        if (!actor.tenantId) throw configurationInvalid()
        return { projectId, tenantId: actor.tenantId, organizationId: actor.organizationId ?? IsNull() }
    }

    async get(projectId: string): Promise<XpertProjectConfigurationView> {
        const { project, role } = await this.access.assertCanRead(projectId)
        const projectType = this.ref(project)
        const schema = this.types.resolve(projectType).configuration?.schema
        const row = await this.configurations.findOneBy(this.where(projectId, project))
        const effectiveValues = effectiveProjectConfiguration(schema, row?.values ?? {})
        const configured = effectiveValues.taskExecutionMaxDurationSeconds
        const maxDurationSeconds = typeof configured === 'number' ? configured : undefined
        const policy = await this.policies.require(project.tenantId)
        return {
            projectType, revision: row?.revision ?? 0, schema, values: row?.values ?? {}, effectiveValues,
            canEdit: project.status !== 'archived' && ['owner', 'manager'].includes(role),
            taskExecution: {
                configuredMaxDurationSeconds: maxDurationSeconds,
                defaultDurationSeconds: policy.defaultDurationSeconds ?? policy.limits.maxDurationSeconds,
                tenantMaxDurationSeconds: policy.limits.maxDurationSeconds,
                effectiveMaxDurationSeconds: resolveExecutionDuration(policy, maxDurationSeconds)
            }
        }
    }

    async update(projectId: string, input: ProjectConfigurationUpdate) {
        const { project } = await this.access.assertCanManage(projectId)
        const actor = { tenantId: project.tenantId, organizationId: project.organizationId, userId: RequestContext.currentUserId() }
        effectiveProjectConfiguration(this.types.resolve(this.ref(project)).configuration?.schema, input.values)
        await this.configurations.manager.transaction(async (manager) => {
            // Serialize initial creation too, without locking another repository or calling external services.
            await manager.findOneOrFail(XpertProject, {
                where: { id: projectId, tenantId: project.tenantId, organizationId: project.organizationId ?? IsNull() },
                lock: { mode: 'pessimistic_write' }
            })
            await this.runtimeAccess.assertHumanManageWithinTransaction({ actor, projectId }, manager)
            const repository = manager.getRepository(XpertProjectConfiguration)
            const where = this.where(projectId, project)
            const row = await repository.findOneBy(where)
            if ((row?.revision ?? 0) !== input.revision)
                throw new ConflictException(t('server-ai:Error.ProjectConfigurationConflict'))
            await repository.save(repository.create({
                ...(row ?? {}), projectId, tenantId: project.tenantId, organizationId: project.organizationId,
                values: input.values, revision: input.revision + 1
            }))
        })
        return this.get(projectId)
    }

    async taskDuration(projectId: string, actor: ProjectAccessActor): Promise<ProjectTaskDurationConfiguration> {
        const access = await this.runtimeAccess.assertEdit({ actor, projectId })
        const projectType = this.ref(access)
        const row = await this.configurations.findOneBy(this.where(projectId, actor))
        const values = effectiveProjectConfiguration(this.types.resolve(projectType).configuration?.schema, row?.values ?? {})
        return { projectType, configurationRevision: row?.revision ?? 0,
            maxDurationSeconds: typeof values.taskExecutionMaxDurationSeconds === 'number'
                ? values.taskExecutionMaxDurationSeconds : undefined }
    }
}
