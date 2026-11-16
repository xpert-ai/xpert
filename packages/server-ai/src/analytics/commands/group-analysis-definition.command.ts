import { Command } from '@nestjs/cqrs'
import type { AnalyticsSourceRef } from '@xpert-ai/contracts'
import type { AnalyticsResolvedSource, DataSourceActor } from '@xpert-ai/plugin-sdk'

/**
 * Resolve only the fixed definition named by a live, accepted analysis grant.
 * approvedById verifies metadata delegation; actor is the viewer or the explicitly authorized delegated issuer.
 * This command never switches identity or grants catalog access or source membership.
 */
export class GroupAnalysisDefinitionCommand extends Command<AnalyticsResolvedSource> {
    constructor(
        readonly actor: DataSourceActor,
        readonly source: Extract<AnalyticsSourceRef, { kind: 'definition' }>,
        readonly approvedById: string
    ) {
        super()
    }
}
