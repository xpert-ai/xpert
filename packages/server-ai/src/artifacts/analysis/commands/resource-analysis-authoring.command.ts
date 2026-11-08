import { Command } from '@nestjs/cqrs'
import type { ResourceAnalysisDataset, ResourceAnalysisPolicy } from '@xpert-ai/contracts'
import type { ContentActor } from '@xpert-ai/plugin-sdk'

/**
 * Inspect one fixed published version as its source manager; omission of policy returns dataset eligibility hints.
 * Supplying policy asserts the requested scope and current source-sharing authority without issuing a grant.
 * Actual grant creation/acceptance retains its own authorization and concurrency checks.
 */
export class ResourceAnalysisAuthoringCommand extends Command<ResourceAnalysisDataset[]> {
    constructor(
        readonly actor: ContentActor,
        readonly artifactId: string,
        readonly versionId: string,
        readonly policy?: ResourceAnalysisPolicy
    ) {
        super()
    }
}
