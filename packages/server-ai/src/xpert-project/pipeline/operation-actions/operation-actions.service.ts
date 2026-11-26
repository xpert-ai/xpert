import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { RequestContext, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import {
    projectPipelineOperationActionSchema,
    type ProjectPipelineOperationActions,
    type ProjectPipelineOperationAction
} from '@xpert-ai/contracts'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { ProjectPipelineRecoveryService } from '../recovery/pipeline-recovery.service'

export const PIPELINE_OPERATION_ACTIONS = Symbol('PIPELINE_OPERATION_ACTIONS')
export interface PipelineOperationActionProvider {
    readonly operationRef: string
    describe(
        context: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity
    ): Promise<ProjectPipelineOperationActions>
    submit(
        context: ProjectPipelineContext,
        operation: ProjectPipelineOperationEntity,
        input: ProjectPipelineOperationAction
    ): Promise<void>
}

/** Host-internal dispatch only. Each operation owner validates its own authority and immutable inputs. */
@Injectable()
export class ProjectPipelineOperationActionsService {
    constructor(
        private readonly db: DataSource,
        private readonly access: ProjectAccessRuntimeService,
        @Inject(PIPELINE_OPERATION_ACTIONS) private readonly providers: PipelineOperationActionProvider[],
        private readonly recovery: ProjectPipelineRecoveryService
    ) {}

    async list(c: ProjectPipelineContext, input: { instanceId: string; nodeInstanceId: string }) {
        if (!(await this.access.listReadable({ actor: c.actor, projectIds: [c.projectId] })).length)
            throw new ForbiddenException()
        const row = await this.db.manager.findOne(ProjectPipelineOperationEntity, {
            where: { ...projectionScope(c), ...input, kind: 'operation' },
            order: { attempt: 'DESC' }
        })
        const provider = row && this.providers.find((item) => item.operationRef === row.handlerRef)
        if (!row) return { operationId: null, messages: [], items: [] }
        const owned = provider ? await provider.describe(c, row) : { operationId: row.id, messages: [], items: [] }
        const recovery = await this.recovery.describe(c, row)
        return {
            operationId: row.id,
            messages: [...owned.messages, ...recovery.messages],
            items: [...owned.items, ...recovery.items]
        }
    }

    async submit(c: ProjectPipelineContext, value: ProjectPipelineOperationAction) {
        const input = projectPipelineOperationActionSchema.parse(value)
        if (
            RequestContext.currentUserId() !== c.actor.userId ||
            RequestContext.currentTenantId() !== c.actor.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (c.actor.organizationId ?? null)
        )
            throw new ForbiddenException()
        await this.access.assertManage(c)
        const row = await this.db.manager.findOneByOrFail(ProjectPipelineOperationEntity, {
            ...projectionScope(c),
            id: input.operationId
        })
        if (this.recovery.handles(input.key)) {
            await this.recovery.submit(c, row, input)
            return { accepted: true }
        }
        const provider = this.providers.find((item) => item.operationRef === row.handlerRef)
        if (!provider || row.kind !== 'operation') throw new ForbiddenException()
        await provider.submit(c, row, input)
        return { accepted: true }
    }
}
