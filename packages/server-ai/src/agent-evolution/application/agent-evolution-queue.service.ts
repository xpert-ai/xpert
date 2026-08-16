import { randomUUID } from 'crypto'
import type {
    EvaluateCandidateCommand,
    EvolutionJob,
    EvolutionJobType,
    StartDeploymentRequest
} from '@xpert-ai/contracts'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'
import { Inject, Injectable, ServiceUnavailableException, Optional } from '@nestjs/common'
import { AgentEvolutionStore } from './agent-evolution.store'
import type { EvolutionCommandContext } from './agent-evolution-governance.service'

export const AGENT_EVOLUTION_QUEUE = 'agent-evolution'
export const AGENT_EVOLUTION_QUEUE_OWNER = '@xpert-ai/platform'

export type AgentEvolutionQueuePayload =
    | { jobId: string; operation: 'evaluation'; context: EvolutionCommandContext; command: EvaluateCandidateCommand }
    | { jobId: string; operation: 'install'; context: EvolutionCommandContext; releasePackageId: string }
    | { jobId: string; operation: 'shadow'; context: EvolutionCommandContext; releasePackageId: string }
    | {
          jobId: string
          operation: 'canary'
          context: EvolutionCommandContext
          releasePackageId: string
          request: StartDeploymentRequest
      }
    | { jobId: string; operation: 'rollback'; context: EvolutionCommandContext; releasePackageId: string }

type AgentEvolutionQueueInput = AgentEvolutionQueuePayload extends infer TPayload
    ? TPayload extends AgentEvolutionQueuePayload
        ? Omit<TPayload, 'jobId' | 'context'>
        : never
    : never

@Injectable()
export class AgentEvolutionQueueService {
    constructor(
        private readonly store: AgentEvolutionStore,
        @Optional()
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue?: ManagedQueueService
    ) {}

    enqueueEvaluation(context: EvolutionCommandContext, command: EvaluateCandidateCommand) {
        return this.enqueue(context, 'evaluation', command.candidateId, {
            operation: 'evaluation',
            command
        })
    }

    enqueueReleaseOperation(
        context: EvolutionCommandContext,
        operation: 'install' | 'shadow' | 'canary' | 'rollback',
        releasePackageId: string,
        request?: StartDeploymentRequest
    ) {
        if (operation === 'canary') {
            return this.enqueue(context, operation, releasePackageId, {
                operation,
                releasePackageId,
                request: request ?? {}
            })
        }
        return this.enqueue(context, operation, releasePackageId, { operation, releasePackageId })
    }

    getJob(context: EvolutionCommandContext, jobId: string) {
        return this.store.findJob(toTenantScope(context), jobId)
    }

    private async enqueue(
        context: EvolutionCommandContext,
        jobType: EvolutionJobType,
        resourceId: string,
        payload: AgentEvolutionQueueInput
    ) {
        if (!this.queue) throw new ServiceUnavailableException('Managed Queue is unavailable')
        const now = new Date().toISOString()
        const jobId = `EVOJOB-${randomUUID()}`
        const job: EvolutionJob = {
            jobId,
            jobType,
            resourceId,
            status: 'queued',
            createdAt: now
        }
        await this.store.saveJob(toTenantScope(context), job)
        try {
            const queued = await this.queue.enqueue<AgentEvolutionQueuePayload>({
                pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
                queueName: AGENT_EVOLUTION_QUEUE,
                jobName: jobType,
                payload: { jobId, context, ...payload } as AgentEvolutionQueuePayload,
                tenantId: context.tenantId,
                organizationId: context.organizationId ?? null,
                userId: context.actorId,
                jobId,
                attempts: 3,
                backoffMs: 1000
            })
            return this.store.updateJobStatus(toTenantScope(context), jobId, 'queued', { queueJobId: queued.jobId })
        } catch (error) {
            await this.store.updateJobStatus(toTenantScope(context), jobId, 'failed', {
                errorCode: 'queue_enqueue_failed',
                errorMessage: errorMessage(error),
                completedAt: new Date().toISOString()
            })
            throw error
        }
    }
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown Managed Queue failure'
}

function toTenantScope(input: { tenantId: string; organizationId?: string | null }) {
    return { tenantId: input.tenantId, organizationId: input.organizationId ?? null }
}
