import { z } from 'zod'
import {
    projectPipelineNodePresentationSchema,
    projectPipelineDefinitionSchema,
    projectPipelineProjectionNodeSchema,
    projectPipelineProjectionEdgeSchema,
    projectPipelineJsonSchema,
    projectPipelineEvidenceRefSchema,
    projectPipelineStatisticsSchema,
    projectPipelineAnalyticsSchema,
    type ProjectPipelineAnalyticsInput,
    projectPipelineProviderActionsSchema,
    projectPipelineProviderActionViewSchema,
    type ProjectPipelineProviderActionCommand,
    type ProjectPipelineDecision,
    type ProjectPipelineEvidenceRef
} from '@xpert-ai/contracts'
import { graphSchema, request } from '../bridge'

export const summarySchema = z.object({
    id: z.string().uuid(),
    title: z.string(),
    authority: z.enum(['provider', 'platform']),
    ownerRef: z.string(),
    sourceKey: z.string(),
    revision: z.number(),
    updatedAt: z.string()
})
export const pipelineGraphSchema = z.object({
    projectId: z.string().uuid(),
    instance: summarySchema,
    cursor: z.string(),
    definition: projectPipelineDefinitionSchema,
    runId: z.string().uuid(),
    roundId: z.string().uuid(),
    historical: z.boolean().default(false),
    historyComplete: z.boolean().default(true),
    snapshotAt: z.string().optional(),
    runState: z
        .enum(['pending', 'active', 'waiting', 'cancelling', 'completed', 'failed', 'cancelled', 'superseded'])
        .default('active'),
    actions: z
        .object({
            cancel: z.boolean(),
            retries: z.array(z.object({ nodeInstanceId: z.string().uuid(), operationId: z.string().uuid() }))
        })
        .default({ cancel: false, retries: [] }),
    round: z.object({ sequence: z.number(), generation: z.number(), state: z.string(), inputDigest: z.string() }),
    executionAttribution: z
        .object({ scope: z.literal('node_round'), unattributedCount: z.number().int().nonnegative() })
        .optional(),
    nodes: z.array(
        z.object({
            id: z.string().uuid(),
            projection: projectPipelineProjectionNodeSchema,
            taskIds: z.array(z.string().uuid()),
            executionIds: z.array(z.string().uuid()).optional()
        })
    ),
    edges: z.array(projectPipelineProjectionEdgeSchema),
    tasks: graphSchema,
    statistics: projectPipelineStatisticsSchema.optional(),
    dispatchEnabled: z.boolean().optional(),
    permissions: z
        .object({ canEdit: z.boolean(), canManage: z.boolean() })
        .default({ canEdit: false, canManage: false }),
    attentions: z
        .array(
            z.object({
                id: z.string().uuid(),
                nodeInstanceId: z.string().uuid(),
                kind: z.enum(['human', 'unknown', 'blocked']),
                source: z.enum(['coordinator', 'provider_action']).optional(),
                state: z.enum(['open', 'resolved', 'superseded']),
                revision: z.number().int().positive(),
                generation: z.number().int().positive(),
                inputDigest: z.string(),
                reasonCode: z.string(),
                outcomes: z.array(z.string()),
                inputEvidence: z.array(projectPipelineEvidenceRefSchema).default([])
            })
        )
        .default([]),
    refresh: z
        .object({
            state: z.enum(['queued', 'running', 'ready', 'not_found', 'failed']),
            errorCode: z.string().nullable(),
            updatedAt: z.string()
        })
        .nullable()
        .default(null)
})
export type PipelineGraph = z.output<typeof pipelineGraphSchema>
export type PipelineNode = PipelineGraph['nodes'][number]
export type PipelineSummary = z.output<typeof summarySchema>
export async function readPipelineAnalytics(input: ProjectPipelineAnalyticsInput) {
    return z
        .object({ success: z.literal(true), data: projectPipelineAnalyticsSchema })
        .parse(await request('executeAction', { actionKey: 'pipeline-analytics', input })).data
}
export async function readProviderActions(instanceId: string, nodeInstanceId: string) {
    return z.object({ success: z.literal(true), data: projectPipelineProviderActionsSchema }).parse(
        await request('executeAction', {
            actionKey: 'pipeline-provider-actions',
            input: { instanceId, nodeInstanceId }
        })
    ).data
}
export async function submitProviderAction(input: ProjectPipelineProviderActionCommand) {
    return z
        .object({ success: z.literal(true), data: projectPipelineProviderActionViewSchema })
        .parse(await request('executeAction', { actionKey: 'pipeline-provider-action', input })).data
}
export async function listPipelines(after?: string) {
    return z
        .object({
            success: z.literal(true),
            data: z.object({ items: z.array(summarySchema), next: z.string().nullable() })
        })
        .parse(await request('executeAction', { actionKey: 'pipeline-list', input: after ? { after } : {} })).data
}
export async function readPipeline(instanceId: string, roundId?: string) {
    return z.object({ success: z.literal(true), data: pipelineGraphSchema }).parse(
        await request('executeAction', {
            actionKey: 'pipeline-graph',
            input: { instanceId, ...(roundId ? { roundId } : {}) }
        })
    ).data
}
export async function refreshPipeline(instanceId: string) {
    return z
        .object({ success: z.literal(true), data: z.object({ status: z.enum(['queued', 'ready']) }) })
        .parse(await request('executeAction', { actionKey: 'pipeline-refresh', input: { instanceId } })).data
}
export async function decidePipeline(input: ProjectPipelineDecision) {
    return z
        .object({ success: z.literal(true), data: z.object({ decisionId: z.string().uuid() }) })
        .parse(await request('executeAction', { actionKey: 'pipeline-decision', input })).data
}
export async function nextPipelineRound(graph: PipelineGraph, requestId: string) {
    return z.object({ success: z.literal(true), data: z.object({ roundId: z.string().uuid() }) }).parse(
        await request('executeAction', {
            actionKey: 'pipeline-next-round',
            input: {
                instanceId: graph.instance.id,
                expectedRevision: graph.instance.revision,
                requestId
            }
        })
    ).data
}
export async function readPipelineEvidence(reference: ProjectPipelineEvidenceRef) {
    return z
        .object({ success: z.literal(true), data: projectPipelineJsonSchema })
        .parse(await request('executeAction', { actionKey: 'pipeline-evidence', input: reference })).data
}
export async function changePipelineLifecycle(graph: PipelineGraph, requestId: string, operationId?: string) {
    return z.object({ success: z.literal(true), data: z.object({ revision: z.number() }) }).parse(
        await request('executeAction', {
            actionKey: operationId ? 'pipeline-retry' : 'pipeline-cancel',
            input: {
                instanceId: graph.instance.id,
                expectedRevision: graph.instance.revision,
                requestId,
                ...(operationId
                    ? { operationId, inputDigest: graph.round.inputDigest, generation: graph.round.generation }
                    : {})
            }
        })
    ).data
}

const roundSummarySchema = z.object({
    id: z.string().uuid(),
    runId: z.string().uuid(),
    sequence: z.number().int().positive(),
    generation: z.number().int().positive(),
    state: z.string(),
    current: z.boolean(),
    createdAt: z.string()
})
export type PipelineRoundSummary = z.output<typeof roundSummarySchema>
export async function readPipelineRounds(instanceId: string, after?: string) {
    return z
        .object({
            success: z.literal(true),
            data: z.object({ items: z.array(roundSummarySchema), next: z.string().nullable() })
        })
        .parse(
            await request('executeAction', {
                actionKey: 'pipeline-rounds',
                input: { instanceId, ...(after ? { after } : {}) }
            })
        ).data
}

export async function readProviderNodeDetails(instanceId: string, nodeInstanceId: string) {
    return z.object({ success: z.literal(true), data: projectPipelineNodePresentationSchema.nullable() }).parse(
        await request('executeAction', {
            actionKey: 'pipeline-provider-node-details',
            input: { instanceId, nodeInstanceId }
        })
    ).data
}
