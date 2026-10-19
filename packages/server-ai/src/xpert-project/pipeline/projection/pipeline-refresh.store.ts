import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ProjectPipelineRefreshStatus } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { ProjectPipelineRefreshEntity } from '../persistence/pipeline.entity'
import type { PipelineRefreshIdentity } from './pipeline-refresh.schema'

@Injectable()
export class ProjectPipelineRefreshStore {
    constructor(
        @InjectRepository(ProjectPipelineRefreshEntity)
        private readonly records: Repository<ProjectPipelineRefreshEntity>
    ) {}

    async begin(
        context: ProjectPipelineContext,
        input: PipelineRefreshIdentity,
        requestId: string,
        state: 'queued' | 'running'
    ) {
        await this.records.upsert(
            {
                id: pipelineIdentity(context, 'refresh', input.providerRef, input.sourceKey),
                projectId: context.projectId,
                tenantId: context.actor.tenantId,
                organizationId: context.actor.organizationId ?? null,
                createdById: context.actor.userId,
                ownerRef: input.providerRef,
                sourceKey: input.sourceKey,
                requestId,
                state,
                errorCode: null
            },
            ['id']
        )
    }

    async update(
        context: ProjectPipelineContext,
        input: PipelineRefreshIdentity,
        requestId: string,
        state: ProjectPipelineRefreshStatus['state'],
        errorCode: string | null = null
    ) {
        // An old worker must not erase diagnostics for a later refresh request.
        await this.records.update(
            { ...projectionScope(context), ownerRef: input.providerRef, sourceKey: input.sourceKey, requestId },
            { state, errorCode }
        )
    }
}
