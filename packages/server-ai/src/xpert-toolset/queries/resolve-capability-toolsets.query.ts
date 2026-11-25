import type { AssistantCapabilityToolsetRequirement } from '@xpert-ai/contracts'

/** Resolve explicit capability connections after authorizing the authoring workspace. */
export class ResolveCapabilityToolsetsQuery {
    constructor(
        readonly workspaceId: string,
        readonly requirements: readonly AssistantCapabilityToolsetRequirement[]
    ) {}
}
