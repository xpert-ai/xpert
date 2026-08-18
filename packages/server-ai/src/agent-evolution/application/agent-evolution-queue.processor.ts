import { Injectable } from '@nestjs/common'
import { PluginJobProcessor, type ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import { AgentEvolutionGovernanceService } from './agent-evolution-governance.service'
import {
    AGENT_EVOLUTION_QUEUE,
    AGENT_EVOLUTION_QUEUE_OWNER,
    type AgentEvolutionQueuePayload
} from './agent-evolution-queue.service'
import { AgentEvolutionStore } from './agent-evolution.store'

@Injectable()
@PluginJobProcessor({
    pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
    queueName: AGENT_EVOLUTION_QUEUE,
    jobName: 'evaluation',
    concurrency: 2
})
@PluginJobProcessor({
    pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
    queueName: AGENT_EVOLUTION_QUEUE,
    jobName: 'install',
    concurrency: 1
})
@PluginJobProcessor({
    pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
    queueName: AGENT_EVOLUTION_QUEUE,
    jobName: 'shadow',
    concurrency: 2
})
@PluginJobProcessor({
    pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
    queueName: AGENT_EVOLUTION_QUEUE,
    jobName: 'canary',
    concurrency: 1
})
@PluginJobProcessor({
    pluginName: AGENT_EVOLUTION_QUEUE_OWNER,
    queueName: AGENT_EVOLUTION_QUEUE,
    jobName: 'rollback',
    concurrency: 1
})
export class AgentEvolutionQueueProcessor {
    constructor(
        private readonly governance: AgentEvolutionGovernanceService,
        private readonly store: AgentEvolutionStore
    ) {}

    async handle(job: ManagedQueueJob<AgentEvolutionQueuePayload>) {
        const payload = job.data
        const tenant = {
            tenantId: payload.context.tenantId,
            organizationId: payload.context.organizationId ?? null
        }
        await this.store.updateJobStatus(tenant, payload.jobId, 'running', { startedAt: new Date().toISOString() })
        try {
            switch (payload.operation) {
                case 'evaluation':
                    await this.governance.evaluateCandidate(payload.context, payload.command)
                    break
                case 'install':
                    await this.governance.installRelease(payload.context, payload.releasePackageId)
                    break
                case 'shadow':
                    await this.governance.startShadow(payload.context, payload.releasePackageId)
                    break
                case 'canary':
                    await this.governance.startCanary(payload.context, payload.releasePackageId, payload.request)
                    break
                case 'rollback':
                    await this.governance.rollbackProduction(payload.context, payload.releasePackageId)
                    break
            }
            await this.store.updateJobStatus(tenant, payload.jobId, 'completed', {
                completedAt: new Date().toISOString()
            })
        } catch (error) {
            await this.store.updateJobStatus(tenant, payload.jobId, 'failed', {
                errorCode: 'evolution_job_failed',
                errorMessage: error instanceof Error ? error.message : 'Unknown evolution job failure',
                completedAt: new Date().toISOString()
            })
            throw error
        }
    }
}
