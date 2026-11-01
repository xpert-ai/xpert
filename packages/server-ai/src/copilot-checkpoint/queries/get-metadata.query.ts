import type { CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { IQuery } from '@nestjs/cqrs'

/** Identity and origin needed for eligibility checks; never includes state or pending writes. */
export type CopilotCheckpointMetadata = Pick<CheckpointTuple, 'config'> & {
    metadata: Pick<CheckpointMetadata, 'source'>
}

export class CopilotCheckpointGetMetadataQuery implements IQuery {
    static readonly type = '[Copilot Checkpoint] Get metadata'

    constructor(
        public readonly configurable: {
            thread_id: string
            checkpoint_ns: string
            checkpoint_id: string
        }
    ) {}
}
