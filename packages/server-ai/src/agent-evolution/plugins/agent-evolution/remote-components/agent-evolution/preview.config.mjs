import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(componentRoot, '../../../../../../../..')
const timestamp = '2026-08-13T10:00:00.000Z'
const targets = [
    target('conformance.field_mapping', 'Conformance Field Mapping'),
    target('conformance.intent_routing', 'Conformance Intent Routing')
]

export default {
    title: 'Agent Evolution · Remote View Preview',
    workspaceRoot,
    instanceId: 'agent-evolution-preview',
    component: { root: componentRoot, runtime: 'react' },
    hostContext: {
        manifest: { key: 'agent_evolution_center' },
        payload: {},
        parameters: { tab: 'overview' },
        initialQuery: { page: 1, pageSize: 1, parameters: {} },
        locale: 'zh-Hans',
        theme: { mode: 'light', tokens: {} },
        debug: { enabled: false, production: true }
    },
    state: {
        requestCount: 0,
        simulationRuns: 0,
        dashboard: emptyDashboard()
    },
    async handleRequest(message, { state }) {
        state.requestCount += 1
        if (message.type === 'requestData') {
            return { type: 'data', data: { items: targets, total: targets.length, summary: state.dashboard } }
        }
        if (message.type === 'executeAction' && message.actionKey === 'run_conformance_simulation') {
            state.simulationRuns += 1
            state.dashboard = completedDashboard()
            return {
                type: 'actionResult',
                result: {
                    success: true,
                    data: {
                        simulationId: 'preview-01',
                        targetId: 'conformance.field_mapping',
                        eventIds: ['LE-1', 'LE-2', 'LE-3', 'LE-4'],
                        proposalId: 'IP-preview-01',
                        candidateId: 'CAND-preview-01',
                        evaluationRunId: 'ER-preview-01',
                        releasePackageId: 'RP-preview-01',
                        deploymentIds: ['DEP-preview-shadow', 'DEP-preview-canary'],
                        previousVersionId: 'CFM-preview-v1',
                        activeVersionId: 'CFM-preview-v2',
                        pointerRevision: 2,
                        gatePassed: true,
                        auditActions: [
                            'release.installed',
                            'deployment.shadow_passed',
                            'deployment.canary_passed',
                            'active_pointer.cas_activated'
                        ]
                    }
                }
            }
        }
        throw new Error(`Unsupported preview request '${message.type}'.`)
    },
    async handleEvent(message, { state }) {
        if (message.type === 'notify') state.lastNotification = { message: message.message, level: message.level }
        return {}
    }
}

function emptyDashboard() {
    return {
        targets,
        events: [],
        proposals: [],
        candidates: [],
        evaluations: [],
        releases: [],
        deployments: [],
        pointers: [],
        audits: []
    }
}

function completedDashboard() {
    const scope = { type: 'organization', key: 'org-preview' }
    const events = ['金额', '总额', '应付金额', '含税金额'].map((field, index) => ({
        eventId: `LE-preview-${index + 1}`,
        eventType: 'prediction_reviewed',
        schemaVersion: '1',
        idempotencyKey: `preview:${index + 1}`,
        eventTime: timestamp,
        scope,
        targetId: 'conformance.field_mapping',
        decisionPoint: 'field_alias_resolution',
        subjectRef: `fixture://preview/${index + 1}`,
        inputFingerprint: `sha256:preview${index + 1}`,
        predictionSummary: 'Field was not mapped by the baseline.',
        finalOutcomeSummary: `Reviewer mapped ${field} to amount.`,
        confidence: 0.32,
        reasonCodes: ['low_confidence_alias'],
        capabilityVersionBundleId: 'bundle-preview-v1',
        bundleHash: 'sha256:bundle-preview-v1',
        trustLevel: 'L3',
        classification: 'internal',
        redactionStatus: 'not_required',
        createdAt: timestamp
    }))
    const baselineBundle = bundle('bundle-preview-v1', 'production', 'CFM-preview-v1', 'sha256:v1')
    const candidateBundle = bundle('bundle-preview-candidate', 'replay', 'CAND-preview-01', 'sha256:v2')
    const caseResults = [
        ['GR-0001', true],
        ['GR-0002', true],
        ['GR-0003', false],
        ['GR-0004', false],
        ['GR-0005', false],
        ['GR-0006', false]
    ].map(([caseId, baselinePassed], index) => ({
        caseId,
        baselineOutput: baselinePassed ? { field: 'amount', value: String(index) } : { field: '', value: '' },
        candidateOutput: { field: 'amount', value: String(index) },
        expectedOutput: { field: 'amount', value: String(index) },
        baselinePassed,
        candidatePassed: true,
        severeError: false,
        latencyMs: 38 + index,
        cost: 0.001,
        traceRef: `fixture://trace/${caseId}`
    }))
    return {
        targets,
        events,
        proposals: [
            {
                proposalId: 'IP-preview-01',
                revision: 1,
                targetId: 'conformance.field_mapping',
                scope,
                title: 'Expand localized amount aliases',
                problemStatement: 'The active mapping misses reviewed localized amount fields.',
                rootCause: 'The baseline alias set only contains normalized English keys.',
                changeHypothesis: 'Add reviewed aliases without changing existing mappings.',
                evidenceEventIds: events.map((event) => event.eventId),
                baseVersionId: 'CFM-preview-v1',
                riskLevel: 'R1',
                status: 'candidate_built',
                createdAt: timestamp,
                createdBy: 'preview-reviewer'
            }
        ],
        candidates: [
            {
                candidateId: 'CAND-preview-01',
                targetId: 'conformance.field_mapping',
                baseVersionId: 'CFM-preview-v1',
                proposalId: 'IP-preview-01',
                proposalRevision: 1,
                artifact: {
                    uri: 'evolution://candidate/preview',
                    hash: 'sha256:v2',
                    schemaVersion: '1',
                    mediaType: 'application/json'
                },
                providerKey: 'conformance.field_mapping',
                providerVersion: '1.0.0',
                dependencyVersionIds: [],
                targetScope: scope,
                buildInputsHash: 'sha256:inputs',
                status: 'packaged',
                createdBy: 'preview-reviewer',
                createdAt: timestamp
            }
        ],
        evaluations: [
            {
                runId: 'ER-preview-01',
                candidateId: 'CAND-preview-01',
                datasetSnapshotId: 'DS-preview-01',
                baselineBundle,
                candidateBundle,
                status: 'passed',
                metrics: {
                    baselineAccuracy: 1 / 3,
                    candidateAccuracy: 1,
                    accuracyDelta: 2 / 3,
                    severeErrors: 0,
                    p95LatencyMs: 43,
                    averageCost: 0.001,
                    totalCases: 6,
                    passedCases: 6
                },
                gate: { passed: true, decision: 'promote', blockingReasons: [] },
                caseResults,
                startedAt: timestamp,
                completedAt: timestamp
            }
        ],
        releases: [
            {
                releasePackageId: 'RP-preview-01',
                candidateId: 'CAND-preview-01',
                candidateHash: 'sha256:v2',
                targetId: 'conformance.field_mapping',
                targetVersionId: 'CFM-preview-v2',
                rollbackVersionId: 'CFM-preview-v1',
                evaluationRunId: 'ER-preview-01',
                scope,
                status: 'active',
                approvalIds: ['APR-preview-01'],
                artifactHash: 'sha256:v2',
                providerKey: 'conformance.field_mapping',
                providerVersion: '1.0.0',
                shadowMinimumSamples: 100,
                canaryPercent: 10,
                createdAt: timestamp,
                createdBy: 'preview-reviewer'
            }
        ],
        deployments: [
            deployment('DEP-preview-shadow', 'shadow', 100, 100, scope),
            deployment('DEP-preview-canary', 'canary', 10, 240, scope)
        ],
        pointers: [
            {
                pointerId: 'PTR-preview-01',
                targetId: 'conformance.field_mapping',
                scope,
                channel: 'production',
                activeVersionId: 'CFM-preview-v2',
                rollbackVersionId: 'CFM-preview-v1',
                releasePackageId: 'RP-preview-01',
                revision: 2,
                updatedAt: timestamp,
                updatedBy: 'preview-reviewer'
            }
        ],
        audits: [
            audit('release.installed', 'Immutable candidate version installed.'),
            audit('deployment.shadow_passed', '100 shadow samples, zero side effects.'),
            audit('deployment.canary_passed', '10% deterministic canary passed.'),
            audit('active_pointer.cas_activated', 'CFM-preview-v1 -> CFM-preview-v2; revision 1 -> 2.')
        ]
    }
}

function target(targetId, displayName) {
    return {
        targetId,
        targetType: 'test_fixture',
        displayName,
        providerKey: targetId,
        providerVersion: '1.0.0',
        artifactSchemaVersion: '1',
        supportedScopes: ['organization'],
        riskLevel: 'R1',
        metricSetId: `${targetId}.accuracy.v1`,
        capabilities: { candidateBuild: true, replay: true, shadow: true, canary: true, install: true, rollback: true },
        status: 'active'
    }
}

function bundle(bundleId, executionMode, versionId, artifactHash) {
    return {
        bundleId,
        bundleHash: `sha256:${bundleId}`,
        executionMode,
        items: [
            {
                targetId: 'conformance.field_mapping',
                versionId,
                artifactHash,
                providerKey: 'conformance.field_mapping',
                providerVersion: '1.0.0'
            }
        ],
        createdAt: timestamp
    }
}

function deployment(deploymentId, channel, canaryPercent, sampleCount, scope) {
    return {
        deploymentId,
        releasePackageId: 'RP-preview-01',
        channel,
        scope,
        status: channel,
        sampleCount,
        candidateAccuracy: 1,
        severeErrors: 0,
        canaryPercent,
        startedAt: timestamp,
        completedAt: timestamp
    }
}

function audit(action, summary) {
    return {
        auditId: `AUD-${action}`,
        releasePackageId: 'RP-preview-01',
        candidateId: 'CAND-preview-01',
        action,
        actorId: 'preview-reviewer',
        actorRole: 'governance_reviewer',
        summary,
        occurredAt: timestamp
    }
}
