import { Injectable } from '@nestjs/common'
import type {
    ProjectPipelineConfigure,
    ProjectPipelineStart,
    ProjectPipelineDecision,
    ProjectPipelineNextRound,
    ProjectPipelineCancel,
    ProjectPipelineRetry
} from '@xpert-ai/contracts'
import {
    ProjectPipelineCommandsRuntimeCapability,
    type ProjectPipelineCommandsApi,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectPipelineManagedStartService } from './pipeline-managed-start.service'
import { ProjectPipelineDecisionService } from './pipeline-decision.service'
import { ProjectPipelineRoundService } from './pipeline-round.service'
import { ProjectPipelineLifecycleService } from './pipeline-lifecycle.service'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineCommandsRuntimeCapability)
export class ProjectPipelineCommandsService implements ProjectPipelineCommandsApi {
    constructor(
        private readonly launch: ProjectPipelineManagedStartService,
        private readonly decisions: ProjectPipelineDecisionService,
        private readonly rounds: ProjectPipelineRoundService,
        private readonly lifecycle: ProjectPipelineLifecycleService
    ) {}
    configure(context: ProjectPipelineContext, request: ProjectPipelineConfigure) {
        return this.launch.configure(context, request)
    }
    start(context: ProjectPipelineContext, request: ProjectPipelineStart) {
        return this.launch.start(context, request)
    }
    decide(context: ProjectPipelineContext, request: ProjectPipelineDecision) {
        return this.decisions.decide(context, request)
    }
    nextRound(context: ProjectPipelineContext, request: ProjectPipelineNextRound) {
        return this.rounds.next(context, request)
    }
    cancel(context: ProjectPipelineContext, request: ProjectPipelineCancel) {
        return this.lifecycle.cancel(context, request)
    }
    retry(context: ProjectPipelineContext, request: ProjectPipelineRetry) {
        return this.lifecycle.retry(context, request)
    }
}
