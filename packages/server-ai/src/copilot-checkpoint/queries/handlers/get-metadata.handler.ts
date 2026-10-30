// Eligibility reads must not hydrate checkpoint state or pending writes, even through indirect callers.
import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { CopilotCheckpointService } from '../../copilot-checkpoint.service'
import { CopilotCheckpointGetMetadataQuery, CopilotCheckpointMetadata } from '../get-metadata.query'

@QueryHandler(CopilotCheckpointGetMetadataQuery)
export class CopilotCheckpointGetMetadataHandler implements IQueryHandler<CopilotCheckpointGetMetadataQuery> {
    constructor(private readonly service: CopilotCheckpointService) {}

    async execute(query: CopilotCheckpointGetMetadataQuery): Promise<CopilotCheckpointMetadata | null> {
        const row = await this.service
            .findOneByOptions({
                // TypeORM's scoped findOne uses the primary key in its DISTINCT subquery.
                select: {
                    id: true,
                    thread_id: true,
                    checkpoint_ns: true,
                    checkpoint_id: true,
                    type: true,
                    metadata: true
                },
                loadEagerRelations: false,
                where: query.configurable
            })
            .catch((error: unknown) => {
                if (error instanceof NotFoundException) return null
                throw error
            })
        if (!row) return null
        const metadata: unknown = await this.service.serde.loadsTyped(row.type ?? 'json', row.metadata)
        if (
            !metadata ||
            typeof metadata !== 'object' ||
            !('source' in metadata) ||
            (metadata.source !== 'input' &&
                metadata.source !== 'loop' &&
                metadata.source !== 'update' &&
                metadata.source !== 'fork')
        )
            return null
        return {
            config: {
                configurable: {
                    thread_id: row.thread_id,
                    checkpoint_ns: row.checkpoint_ns,
                    checkpoint_id: row.checkpoint_id
                }
            },
            metadata: { source: metadata.source }
        }
    }
}
