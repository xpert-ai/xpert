import { Command } from '@nestjs/cqrs'
import type { ContentActor } from '@xpert-ai/plugin-sdk'
import type { ResourceAnalysisDescription, ResourceAnalysisQuery, ResourceAnalysisResult } from '@xpert-ai/contracts'

type Operation =
    | { kind: 'describe'; referenceId: string }
    | { kind: 'query'; referenceId: string; query: ResourceAnalysisQuery }
    | { kind: 'validate-delivery' }
/**
 * Describe/query an accepted reference or recheck its audited queries before publishing a group answer.
 * The trusted human-addressed execution adapter supplies actor, Assistant and executionId (the budget/audit scope).
 * These identities must not come from model arguments; validate-delivery returns no dataset and grants no new access.
 */
export class GroupResourceAnalysisCommand extends Command<ResourceAnalysisDescription | ResourceAnalysisResult | void> {
    constructor(
        readonly actor: ContentActor,
        readonly groupId: string,
        readonly assistantId: string,
        readonly executionId: string,
        readonly operation: Operation
    ) {
        super()
    }
}
