import { ForbiddenException, Injectable } from '@nestjs/common'
import {
    ProjectPipelineEvidenceRuntimeCapability,
    RuntimeCapabilityProvider,
    type ProjectPipelineContext,
    type ProjectPipelineEvidenceApi
} from '@xpert-ai/plugin-sdk'
import { projectPipelineEvidenceRefSchema, type ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectPipelineEvidenceService } from './pipeline-evidence.service'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineEvidenceRuntimeCapability)
export class ProjectPipelineEvidenceAccessService implements ProjectPipelineEvidenceApi {
    constructor(
        private readonly access: ProjectAccessRuntimeService,
        private readonly evidence: ProjectPipelineEvidenceService
    ) {}
    async read(context: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef) {
        const readable = await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })
        if (!readable.length) throw new ForbiddenException()
        return this.evidence.verify(context, projectPipelineEvidenceRefSchema.parse(reference))
    }
}
