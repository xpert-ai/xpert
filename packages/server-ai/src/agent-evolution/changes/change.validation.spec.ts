import { evidenceDrivenStrategy } from '@xpert-ai/contracts'
import { initialStages } from './strategy.service'
import type {
    EvolutionChange,
    EvolutionChangeCandidate,
    EvolutionChangeEvaluation,
    EvolutionStrategy,
    SubmitEvolutionChange
} from '@xpert-ai/contracts'
import { validateChangeInput, validateChangeEvaluation } from './change.validation'
const policy: EvolutionStrategy = evidenceDrivenStrategy({
    version: 'template/1',
    evidenceKinds: ['feedback', 'execution'],
    requiredChecks: [
        { kind: 'render', origin: 'maintained', blocking: true },
        { kind: 'boundary', blocking: true }
    ]
})
const input: SubmitEvolutionChange = {
    strategyId: policy.id,
    sourceKind: 'business_evidence',
    tenantId: 't',
    organizationId: 'o',
    targetId: 'test.template',
    requestId: 'r',
    scope: { type: 'organization', key: 'o' },
    baseline: { resourceId: 'template', version: '1', hash: 'base' },
    evidence: [{ kind: 'feedback', subjectKey: 'session', uri: 'feedback://1', version: '1', hash: 'proof' }]
}
const candidate: EvolutionChangeCandidate = {
    artifact: { uri: 'test://template', hash: 'candidate', schemaVersion: '1', mediaType: 'application/json' },
    baseline: input.baseline,
    changes: [
        {
            operation: 'replace',
            path: '/salutation',
            summary: 'Use display name',
            before: 'Hello',
            after: 'Hello {{name}}'
        }
    ],
    summary: 'Greeting template',
    warnings: []
}
const change: EvolutionChange = {
    ...input,
    contractVersion: 3,
    changeId: 'c',
    strategy: { riskLevel: 'R1', definition: policy, hash: 'STRATEGY', providerKey: 'test', providerVersion: '1' },
    learningEventIds: [],
    candidateInput: {},
    datasetSnapshotIds: {},
    stages: initialStages(policy),
    evidenceHash: 'evidence',
    status: 'testing',
    candidate,
    jobId: 'j',
    createdBy: 'u',
    createdAt: '',
    updatedAt: ''
}
function evaluation(): EvolutionChangeEvaluation {
    const render = (name: string) => candidate.changes[0].after.replace('{{name}}', name)
    return {
        runId: 'test',
        candidateHash: 'candidate',
        baselineHash: 'base',
        evidenceHash: 'evidence',
        datasetVersion: 'fixtures/1',
        datasetHash: 'fixtures-hash',
        readiness: [],
        checks: [
            {
                checkId: 'display-name',
                title: 'Uses display name',
                kind: 'render',
                origin: 'maintained',
                blocking: true,
                passed: render('Ada') === 'Hello Ada',
                details: 'Known fixture',
                evidenceRefs: ['fixture://ada']
            },
            {
                checkId: 'literal-input',
                title: 'Input remains literal',
                kind: 'boundary',
                origin: 'maintained',
                blocking: true,
                passed: render('<script>') === 'Hello <script>',
                details: 'Plain text template',
                evidenceRefs: ['fixture://literal']
            }
        ],
        passed: true,
        completedAt: '2026-09-08T00:00:00Z'
    }
}
it('accepts a target-defined non-BOM policy and evaluates real template outputs', () => {
    expect(() => validateChangeInput(input, policy)).not.toThrow()
    expect(() => validateChangeEvaluation(change, evaluation(), policy.evaluations[0].requiredChecks)).not.toThrow()
})
it('requires declared evidence kinds and scoped identity', () => {
    expect(() => validateChangeInput({ ...input, organizationId: 'other' }, policy)).toThrow()
    expect(() =>
        validateChangeInput({ ...input, evidence: [{ ...input.evidence[0], kind: 'document' }] }, policy)
    ).toThrow()
})
it('rejects missing mandatory coverage, false pass, duplicate checks and changed snapshots', () => {
    const good = evaluation()
    for (const bad of [
        { ...good, checks: good.checks.slice(0, 1) },
        { ...good, checks: good.checks.map((item) => ({ ...item, passed: false })) },
        { ...good, checks: [...good.checks, good.checks[0]] },
        { ...good, candidateHash: 'different' },
        { ...good, evidenceHash: 'different' },
        { ...good, baselineHash: 'different' }
    ]) {
        expect(() => validateChangeEvaluation(change, bad, policy.evaluations[0].requiredChecks)).toThrow()
    }
})
