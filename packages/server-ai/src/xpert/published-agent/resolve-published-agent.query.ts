import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { AgentMiddlewarePublishedAgentTarget, AgentMiddlewareResolvedAgent } from '@xpert-ai/plugin-sdk'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { resolvePublishedAgent } from './resolve-published-agent'

/** Resolve a published Agent entrypoint within the requester's authorized workspace resources. */
export class ResolvePublishedAgentQuery extends Query<AgentMiddlewareResolvedAgent> {
    constructor(readonly input: AgentMiddlewarePublishedAgentTarget) {
        super()
    }
}

@QueryHandler(ResolvePublishedAgentQuery)
export class ResolvePublishedAgentHandler implements IQueryHandler<ResolvePublishedAgentQuery> {
    constructor(private readonly access: PublishedXpertAccessService) {}
    execute(query: ResolvePublishedAgentQuery) {
        return resolvePublishedAgent(this.access, query.input)
    }
}
