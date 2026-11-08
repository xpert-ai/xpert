import { Command } from '@nestjs/cqrs'
import type { AnalyticsSourceRef } from '@xpert-ai/contracts'
import type { AnalyticsResolvedSource, DataSourceActor } from '@xpert-ai/plugin-sdk'

/**
 * Resolve only the fixed definition named by a live, accepted analysis grant.
 * approvedById is the grant issuer used to verify metadata delegation; actor remains the querying human.
 * This does not grant catalog access, source membership or execution under the issuer's credentials.
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
