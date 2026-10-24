import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { projectPipelineEvidenceRefSchema, type ProjectPipelineEvidenceRef } from '@xpert-ai/contracts'
import {
    ProjectPipelineContributor,
    ProjectPipelineRuntimeAdapterProvider,
    type ProjectPipelineContext,
    type ProjectPipelineContribution,
    type ProjectPipelineOperationContext,
    type ProjectPipelineOperationReceipt
} from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineDecisionEntity } from '../persistence/pipeline.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import {
    PIPELINE_DECISION_EVIDENCE,
    PIPELINE_HUMAN_DECISION_SCHEMA,
    PIPELINE_POLICY_DECISION_SCHEMA,
    pipelineDecisionEvidence,
    pipelineDecisionValue
} from './pipeline-decision-evidence'

const decisionSchema = z
    .object({
        id: z.string().uuid(),
        kind: z.enum(['policy', 'human']),
        policyRef: z.string(),
        outcome: z.string(),
        actorId: z.string().uuid(),
        inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
        generation: z.number().int().positive(),
        nodeInstanceId: z.string().uuid(),
        roundId: z.string().uuid(),
        operationId: z.string().uuid(),
        evidence: z.array(projectPipelineEvidenceRefSchema)
    })
    .strict()

@Injectable()
@ProjectPipelineContributor('platform.pipeline')
export class ProjectPipelineBuiltinContribution implements ProjectPipelineContribution {
    readonly key = 'platform.pipeline'
    readonly configurations = []
    readonly descriptors = [
        { kind: 'schema' as const, ref: PIPELINE_HUMAN_DECISION_SCHEMA },
        { kind: 'schema' as const, ref: PIPELINE_POLICY_DECISION_SCHEMA },
        { kind: 'completion' as const, ref: 'platform.output-validated@1' }
    ]
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('schema', PIPELINE_HUMAN_DECISION_SCHEMA)
export class ProjectPipelineHumanDecisionSchema {
    readonly kind = 'schema' as const
    readonly ref = PIPELINE_HUMAN_DECISION_SCHEMA
    parse(value: unknown) {
        return decisionSchema.extend({ kind: z.literal('human') }).parse(value)
    }
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('schema', PIPELINE_POLICY_DECISION_SCHEMA)
export class ProjectPipelinePolicyDecisionSchema {
    readonly kind = 'schema' as const
    readonly ref = PIPELINE_POLICY_DECISION_SCHEMA
    parse(value: unknown) {
        return decisionSchema.extend({ kind: z.literal('policy') }).parse(value)
    }
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('completion', 'platform.output-validated@1')
export class ProjectPipelineValidatedCompletion {
    readonly kind = 'completion' as const
    readonly ref = 'platform.output-validated@1'
    async evaluate(_context: ProjectPipelineOperationContext, receipt: ProjectPipelineOperationReceipt) {
        return receipt.status === 'succeeded'
            ? { status: 'accepted' as const, evidence: Object.values(receipt.outputs) }
            : { status: 'pending' as const, code: 'OUTPUT_PENDING' }
    }
}
@Injectable()
@ProjectPipelineRuntimeAdapterProvider('evidence', PIPELINE_DECISION_EVIDENCE)
export class ProjectPipelineDecisionEvidenceResolver {
    readonly kind = 'evidence' as const
    readonly ref = PIPELINE_DECISION_EVIDENCE
    constructor(
        @InjectRepository(ProjectPipelineDecisionEntity)
        private readonly decisions: Repository<ProjectPipelineDecisionEntity>,
        private readonly access: ProjectAccessRuntimeService
    ) {}
    async read(context: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef) {
        if (!(await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })).length)
            throw pipelineProjectionConflict('EVIDENCE_ACCESS_DENIED')
        const decision = await this.decisions.findOneByOrFail({
            ...projectionScope(context),
            id: z.string().uuid().parse(reference.objectKey)
        })
        const expected = pipelineDecisionEvidence(decision)
        if (
            reference.resolverRef !== expected.resolverRef ||
            reference.schemaRef !== expected.schemaRef ||
            reference.version !== expected.version ||
            reference.digest !== expected.digest ||
            reference.producerOperationId !== expected.producerOperationId
        )
            throw pipelineProjectionConflict('EVIDENCE_VERSION_CONFLICT')
        return pipelineDecisionValue(decision)
    }
}
export const ProjectPipelineBuiltinAdapters = [
    ProjectPipelineBuiltinContribution,
    ProjectPipelineHumanDecisionSchema,
    ProjectPipelinePolicyDecisionSchema,
    ProjectPipelineValidatedCompletion,
    ProjectPipelineDecisionEvidenceResolver
]
