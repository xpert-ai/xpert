import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    KnowledgebaseRuntimeCapability,
    type KnowledgebaseApi,
    KnowledgebaseDeleteChunksInput,
    KnowledgebaseDeleteChunksResult,
    KnowledgebaseListInput,
    KnowledgebaseListItem,
    KnowledgebaseSearchInput,
    KnowledgebaseSearchResult,
    KnowledgebaseWriteChunkInput,
    KnowledgebaseWriteChunkResult,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { DeleteAgentKnowledgeChunksCommand, WriteAgentKnowledgeChunkCommand } from '../commands'
import { KnowledgeSearchQuery, ListWorkspaceKnowledgebasesQuery } from '../queries'
import { RuntimeCapabilityProvider } from '../../shared/runtime/runtime-capability-provider.decorator'
import { normalizeOptionalString } from '../../shared/runtime/runtime-input'

@Injectable()
@RuntimeCapabilityProvider(KnowledgebaseRuntimeCapability)
export class KnowledgebaseRuntimeService implements KnowledgebaseApi {
    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async list(input: KnowledgebaseListInput = {}): Promise<KnowledgebaseListItem[]> {
        const workspaceId = normalizeOptionalString(input.workspaceId)
        if (!workspaceId) {
            return []
        }

        return this.queryBus.execute(
            new ListWorkspaceKnowledgebasesQuery({
                workspaceId,
                published: input.published,
                limit: input.limit
            })
        )
    }

    async search(input: KnowledgebaseSearchInput): Promise<KnowledgebaseSearchResult> {
        return this.queryBus.execute(
            new KnowledgeSearchQuery({
                tenantId: input.tenantId ?? RequestContext.currentTenantId(),
                organizationId: input.organizationId ?? RequestContext.getOrganizationId(),
                knowledgebases: input.knowledgebaseIds,
                query: input.query,
                k: input.k,
                score: input.score,
                filters: { request: input.filter },
                retrieval: input.retrieval,
                source: input.source,
                id: input.requestId
            })
        )
    }

    async writeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult> {
        return this.commandBus.execute(new WriteAgentKnowledgeChunkCommand(input))
    }

    async deleteChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult> {
        return this.commandBus.execute(new DeleteAgentKnowledgeChunksCommand(input))
    }
}
