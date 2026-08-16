import type {
    BuildEvolutionCandidateRequest,
    CandidateBuildResult,
    CandidateValidationResult,
    EvolutionTargetProvider,
    MetricObservation,
    ReleaseProviderReceipt,
    ReleaseProviderRequest,
    ReplayCaseRequest,
    ReplayCaseResult,
    ValidateEvolutionCandidateRequest
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderStrategy } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { CONFORMANCE_FIELD_MAPPING_EXAMPLE } from '../examples'

export const CONFORMANCE_FIELD_MAPPING_TARGET = 'conformance.field_mapping'

@Injectable()
@EvolutionTargetProviderStrategy(CONFORMANCE_FIELD_MAPPING_TARGET)
export class ConformanceFieldMappingProvider implements EvolutionTargetProvider {
    readonly descriptor = {
        targetId: CONFORMANCE_FIELD_MAPPING_TARGET,
        targetType: 'test_fixture' as const,
        displayName: 'Conformance Field Mapping',
        providerKey: CONFORMANCE_FIELD_MAPPING_TARGET,
        providerVersion: '1.0.0',
        artifactSchemaVersion: '1',
        supportedScopes: ['organization' as const],
        riskLevel: 'R1' as const,
        metricSetId: 'conformance.mapping.accuracy.v1',
        candidateForm: {
            description: 'Conformance-only fixture Change Set.',
            fields: [
                {
                    key: 'aliases',
                    label: 'Localized aliases',
                    type: 'string_array' as const,
                    required: true,
                    defaultValue: [...CONFORMANCE_FIELD_MAPPING_EXAMPLE.candidateAliases]
                }
            ]
        },
        capabilities: {
            candidateBuild: true,
            replay: true,
            shadow: true,
            canary: true,
            install: true,
            rollback: true
        },
        status: 'active' as const
    }

    readonly candidateBuilder = this
    readonly replayEvaluator = this
    readonly releaseProvider = this

    async buildCandidate(request: BuildEvolutionCandidateRequest): Promise<CandidateBuildResult> {
        const manifest = {
            targetId: request.targetId,
            baseVersionId: request.baseVersionId,
            aliases: [...CONFORMANCE_FIELD_MAPPING_EXAMPLE.candidateAliases],
            canonicalField: CONFORMANCE_FIELD_MAPPING_EXAMPLE.canonicalField,
            evidenceEventIds: [...request.evidenceEventIds].sort()
        }
        const artifactHash = hashEvolutionValue(manifest)
        const buildInputsHash = hashEvolutionValue({
            proposalId: request.proposalId,
            proposalRevision: request.proposalRevision,
            baseVersionId: request.baseVersionId,
            changeSet: request.changeSet,
            evidenceEventIds: [...request.evidenceEventIds].sort(),
            providerVersion: this.descriptor.providerVersion
        })
        return {
            artifact: {
                uri: `evolution://candidate/${artifactHash.slice(7)}`,
                hash: artifactHash,
                schemaVersion: this.descriptor.artifactSchemaVersion,
                mediaType: 'application/json'
            },
            normalizedManifest: manifest,
            dependencyVersionIds: [...request.dependencyVersionIds].sort(),
            validationSummary: 'Alias mapping artifact is deterministic and contains no executable content.',
            warnings: [],
            providerTraceId: randomUUID(),
            buildInputsHash
        }
    }

    async validateCandidate(request: ValidateEvolutionCandidateRequest): Promise<CandidateValidationResult> {
        return {
            valid:
                request.targetId === this.descriptor.targetId &&
                request.artifact.schemaVersion === this.descriptor.artifactSchemaVersion &&
                request.artifact.hash.startsWith('sha256:'),
            failureCodes: [],
            warnings: []
        }
    }

    async runReplayCase(request: ReplayCaseRequest): Promise<ReplayCaseResult> {
        const input = request.caseRevision.input
        const sourceField = typeof input.sourceField === 'string' ? input.sourceField : ''
        const value = typeof input.value === 'string' || typeof input.value === 'number' ? input.value : ''
        const expected = request.caseRevision.expected
        const baselineOutput = mapField(sourceField, value, CONFORMANCE_FIELD_MAPPING_EXAMPLE.baselineAliases)
        const candidateOutput = mapField(sourceField, value, CONFORMANCE_FIELD_MAPPING_EXAMPLE.candidateAliases)
        const baselinePassed = sameMapping(baselineOutput, expected)
        const candidatePassed = sameMapping(candidateOutput, expected)
        return {
            caseId: request.caseRevision.caseId,
            baselineOutput,
            candidateOutput,
            expectedOutput: expected,
            baselinePassed,
            candidatePassed,
            severeError: request.caseRevision.risk === 'high' && !candidatePassed,
            latencyMs: 38 + request.repeatIndex,
            cost: 0.001,
            traceRef: `conformance://replay/${request.evaluationRunId}/${request.caseRevision.caseId}`
        }
    }

    async evaluateResult(_request: ReplayCaseRequest, result: ReplayCaseResult): Promise<MetricObservation[]> {
        return [
            {
                metricKey: 'candidate_accuracy',
                value: result.candidatePassed ? 1 : 0,
                unit: 'ratio',
                blocking: false
            },
            {
                metricKey: 'severe_errors',
                value: result.severeError ? 1 : 0,
                unit: 'count',
                blocking: true
            }
        ]
    }

    install(request: ReleaseProviderRequest) {
        return Promise.resolve(receipt(request, 'install', 'ready'))
    }

    activate(request: ReleaseProviderRequest) {
        return Promise.resolve(receipt(request, 'activate', 'completed'))
    }

    rollback(request: ReleaseProviderRequest) {
        return Promise.resolve(receipt(request, 'rollback', 'completed'))
    }
}

function mapField(sourceField: string, value: string | number, aliases: readonly string[]) {
    return aliases.includes(sourceField)
        ? { field: CONFORMANCE_FIELD_MAPPING_EXAMPLE.canonicalField, value }
        : { field: '', value: '' }
}

function sameMapping(
    actual: Record<string, string | number | boolean>,
    expected: Record<string, string | number | boolean>
) {
    return actual.field === expected.field && actual.value === expected.value
}

function receipt(
    request: ReleaseProviderRequest,
    operation: ReleaseProviderReceipt['operation'],
    status: ReleaseProviderReceipt['status']
): ReleaseProviderReceipt {
    return {
        receiptId: hashEvolutionValue({
            idempotencyKey: request.idempotencyKey,
            operation,
            versionId: request.versionId
        }).slice(7, 43),
        versionId: request.versionId,
        operation,
        status,
        providerTraceId: randomUUID()
    }
}
