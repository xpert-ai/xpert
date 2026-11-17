import { Injectable } from '@nestjs/common'
import { DataSource, IsNull } from 'typeorm'
import { currentPluginViewAction } from '@xpert-ai/server-core'
import {
    humanDecisionInputSchema,
    type HumanDecisionInput,
    type HumanDecisionResult,
    WorkbenchDecisionCapability,
    RuntimeCapabilityProvider
} from '@xpert-ai/plugin-sdk'
import { AgentEventBinding } from './agent-event.entity'
import { AgentEventSources, sourceContext } from './agent-event-sources'
import { EventBindingAccessService } from './event-binding-access.service'

/**
 * Resolves a single event source binding for the acting user, plugin and workbench host.
 * Each submission rechecks access to the published assistant and holds a shared lock on
 * the binding until the source returns, so revocation and submission are ordered.
 */
@Injectable()
@RuntimeCapabilityProvider(WorkbenchDecisionCapability)
export class WorkbenchDecisionService {
    constructor(
        private readonly db: DataSource,
        private readonly sources: AgentEventSources,
        private readonly access: EventBindingAccessService
    ) {}

    async submit(adapter: string, sourceBindingRef: string, input: HumanDecisionInput): Promise<HumanDecisionResult> {
        const frame = currentPluginViewAction()
        const denied = { status: 'forbidden' } as const
        if (!frame || !humanDecisionInputSchema.safeParse(input).success) return denied
        const { context, plugin } = frame
        const { tenantId, organizationId, workspaceId, userId, hostType, hostId } = context
        if (!tenantId || !organizationId || !workspaceId || !userId || !['agent', 'project'].includes(hostType))
            return denied
        return this.db.transaction(async (tx) => {
            const bindings = await tx
                .createQueryBuilder(AgentEventBinding, 'b')
                .where({
                    plugin,
                    adapter,
                    sourceBindingRef,
                    tenantId,
                    organizationId,
                    workspaceId,
                    userId,
                    state: 'enabled',
                    capture: true,
                    ...(hostType === 'agent' ? { xpertId: hostId, projectId: IsNull() } : { projectId: hostId })
                })
                .take(2)
                .setLock('pessimistic_read')
                .getMany()
            if (bindings.length !== 1) return denied
            const [binding] = bindings
            await this.access.assertAccessible(binding, true)
            const outputs = this.sources.resolve(binding).outputs
            if (!outputs?.submitDecision) return denied
            return outputs.submitDecision(sourceContext(binding, AbortSignal.timeout(15000)), input, 'workbench')
        })
    }
}
