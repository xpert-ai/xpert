import type { XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { AgentEvolutionService } from '../../application'

@Injectable()
export class AgentEvolutionAppService {
    constructor(private readonly evolution: AgentEvolutionService) {}

    async getViewData(context: XpertResolvedViewHostContext, _query: XpertViewQuery) {
        await this.evolution.synchronizeTargets(context)
        const dashboard = await this.evolution.getDashboard(context)
        return {
            items: dashboard.targets,
            total: dashboard.targets.length,
            summary: dashboard
        }
    }

    async getStatus(context: Pick<XpertResolvedViewHostContext, 'tenantId' | 'organizationId'>, targetId?: string) {
        const dashboard = await this.evolution.getDashboard(context)
        const targets = targetId
            ? dashboard.targets.filter((target) => target.targetId === targetId)
            : dashboard.targets
        return {
            targets,
            learningEventCount: dashboard.events.length,
            proposalCount: dashboard.proposals.length,
            candidateCount: dashboard.candidates.length,
            activeReleaseCount: dashboard.releases.filter((release) => release.status === 'active').length,
            pointers: dashboard.pointers
        }
    }

    runSimulation(context: XpertResolvedViewHostContext) {
        return this.evolution.runConformanceSimulation({
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            actorId: context.userId,
            actorRole: 'human_operator'
        })
    }
}
