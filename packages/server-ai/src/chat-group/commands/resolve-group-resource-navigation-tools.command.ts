import { Command } from '@nestjs/cqrs'
import type { DynamicStructuredTool } from '@langchain/core/tools'

/** Trusted runtime locators from the host, never middleware options or model-provided arguments. */
export interface ResourceNavigationInvocation {
    /** Tenant boundary of the admitted invocation. */
    tenantId: string
    /** Organization boundary shared by the conversation, participant and delivery. */
    organizationId: string
    /** Ordinary conversation or private group-Assistant runtime; never the public group conversation. */
    conversationId: string
    /** Assistant owning this invocation; group resolution must match its active participant. */
    assistantId: string
    /** Current usage Project, verified against persistence; never a shared resource's source Project. */
    projectId: string
    /** Required for group navigation; binds the tools to the participant's runtime thread. */
    threadId?: string
}

/**
 * Resolve navigation ownership from the persisted conversation and exact admitted group delivery.
 * `project` is returned only for a verified ordinary conversation. Missing/revoked group context rejects;
 * callers must never interpret an error or an empty group toolset as permission to search the Project.
 * Tools remain in-process and reauthorize membership, source grants and the live execution on each call.
 */
export class ResolveGroupResourceNavigationToolsCommand extends Command<
    { scope: 'project' } | { scope: 'group'; tools: DynamicStructuredTool[] }
> {
    constructor(public readonly invocation: ResourceNavigationInvocation) {
        super()
    }
}
