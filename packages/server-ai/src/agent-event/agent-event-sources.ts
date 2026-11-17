import { ForbiddenException, Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    AGENT_EVENT_SOURCE,
    BaseStrategyRegistry,
    type AgentEventContext,
    type PluginAgentEventSource
} from '@xpert-ai/plugin-sdk'
import type { AgentEventBinding } from './agent-event.entity'
import { FollowUpTimerSource, timerSource } from './follow-up-timer.source'

@Injectable()
export class AgentEventSources extends BaseStrategyRegistry<PluginAgentEventSource> {
    constructor(
        discovery: DiscoveryService,
        reflector: Reflector,
        private readonly timers?: FollowUpTimerSource
    ) {
        super(AGENT_EVENT_SOURCE, discovery, reflector)
    }

    resolve(binding: Pick<AgentEventBinding, 'adapter' | 'plugin' | 'organizationId'>): PluginAgentEventSource {
        if (this.timers && binding.plugin === timerSource.plugin && binding.adapter === timerSource.adapter)
            return this.timers
        const source = this.get(binding.adapter, binding.organizationId)
        const provenance = this.getSource(source)
        if (
            provenance.kind !== 'plugin' ||
            provenance.pluginName !== binding.plugin ||
            source.key !== binding.adapter ||
            source.protocolVersion !== 1
        )
            throw new ForbiddenException('event_source_unavailable')
        return source
    }
}

export function sourceContext(binding: AgentEventBinding, signal: AbortSignal): AgentEventContext {
    return Object.freeze({
        bindingId: binding.id,
        bindingRevision: binding.revision,
        sourceBindingRef: binding.sourceBindingRef,
        tenantId: binding.tenantId,
        organizationId: binding.organizationId,
        workspaceId: binding.workspaceId,
        projectId: binding.projectId ?? undefined,
        userId: binding.userId,
        xpertId: binding.xpertId,
        signal
    })
}
