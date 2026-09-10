import {
    evidenceDrivenStrategy,
    HUMAN_PROPOSAL_STRATEGY,
    FEEDBACK_LEARNING_STRATEGY,
    type LearningEvent
} from '@xpert-ai/contracts'
import { EvolutionStrategyService, initialStages } from './strategy.service'
import { EvolutionEvaluationExecutor } from './evaluation-executor.service'
import { AgentEvolutionQualityGovernanceService } from '../application/agent-evolution-quality-governance.service'
import type { DataSource } from 'typeorm'
import type {
    EvolutionChange,
    EvolutionChangeProvider,
    EvolutionPublicationReceipt,
    SubmitEvolutionChange
} from '@xpert-ai/contracts'
import type { EvolutionTargetProviderRegistry, ManagedQueueService } from '@xpert-ai/plugin-sdk'
import type { AgentEvolutionStore } from '../application/agent-evolution.store'
jest.mock('@xpert-ai/plugin-sdk', () => ({
    EvolutionChangeRuntimeCapability: 'changes',
    EvolutionTargetProviderRegistry: class {},
    MANAGED_QUEUE_SERVICE_TOKEN: 'queue'
}))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'org',
        currentUserId: () => 'reviewer',
        currentRoleId: () => 'maintainer',
        hasPermission: () => true,
        currentUser: () => ({ role: { name: 'SUPER_ADMIN' } })
    }
}))
jest.mock('../../shared/runtime', () => ({ RuntimeCapabilityProvider: () => () => undefined }))
jest.mock('../application/agent-evolution.store', () => ({ AgentEvolutionStore: class {} }))
jest.mock('../entities/evolution.entities', () => ({
    ApprovalDecisionEntity: class {},
    EvolutionAuditEventEntity: class {},
    EvolutionCandidateEntity: class {},
    ImprovementProposalEntity: class {},
    EvaluationRunEntity: class {},
    ReleasePackageEntity: class {}
}))
import { EvolutionChangeService, digest } from './change.service'
import { EvolutionChangeStore } from './change.store'
import {
    ApprovalDecisionEntity,
    EvolutionAuditEventEntity,
    EvolutionCandidateEntity,
    ImprovementProposalEntity,
    EvaluationRunEntity,
    ReleasePackageEntity
} from '../entities/evolution.entities'

const identity = { tenantId: 'tenant', organizationId: 'org', changeId: 'EVO-1' }
const definition = evidenceDrivenStrategy({
    version: 'template/1',
    evidenceKinds: ['feedback'],
    requiredChecks: [{ kind: 'render', blocking: true }]
})
const descriptor = {
    targetId: 'test.template',
    artifactSchemaVersion: '1',
    riskLevel: 'R1',
    providerKey: 'test.template',
    providerVersion: '1',
    strategies: [definition],
    supportedScopes: ['organization'],
    status: 'active',
    capabilities: { install: false }
}
const strategy = { riskLevel: 'R1' as const, definition, hash: '', providerKey: 'test.template', providerVersion: '1' }
const initial: EvolutionChange = {
    contractVersion: 3,
    strategy,
    sourceKind: 'business_evidence',
    learningEventIds: [],
    candidateInput: {},
    datasetSnapshotIds: {},
    stages: initialStages(definition),
    changeId: 'EVO-1',
    targetId: 'test.template',
    requestId: 'REQ-1',
    scope: { type: 'organization', key: 'org' },
    baseline: { resourceId: 'BASE', version: '1', hash: 'BASE-HASH' },
    evidence: [{ kind: 'feedback', subjectKey: 'SESSION', uri: 'feedback://1', version: '1', hash: 'FEEDBACK' }],
    evidenceHash: 'EVIDENCE',
    status: 'pending_approval',
    jobId: 'JOB',
    createdBy: 'reviewer',
    createdAt: '2026-09-08T00:00:00Z',
    updatedAt: '2026-09-08T00:00:01Z',
    candidate: {
        artifact: { uri: 'test://candidate', hash: 'CANDIDATE', schemaVersion: '1', mediaType: 'application/json' },
        baseline: { resourceId: 'BASE', version: '1', hash: 'BASE-HASH' },
        summary: 'Greeting template',
        changes: [],
        warnings: []
    },
    evaluation: {
        runId: 'EVAL',
        candidateHash: 'CANDIDATE',
        baselineHash: 'BASE-HASH',
        evidenceHash: 'EVIDENCE',
        datasetVersion: 'FIXTURE-1',
        datasetHash: 'DATA',
        checks: [
            {
                checkId: 'render',
                title: 'Render name',
                kind: 'render',
                origin: 'maintained',
                passed: true,
                blocking: true,
                details: 'Independent fixture',
                evidenceRefs: ['fixture://Ada']
            }
        ],
        readiness: [],
        passed: true,
        completedAt: '2026-09-08T00:00:01Z'
    }
}

type Row = Record<string, unknown>
async function harness(seed: EvolutionChange | null = initial) {
    let tables = new Map<unknown, Row[]>()
    const keys = new Map<unknown, string>([
        [ImprovementProposalEntity, 'proposalId'],
        [EvolutionCandidateEntity, 'candidateId'],
        [EvaluationRunEntity, 'runId'],
        [ApprovalDecisionEntity, 'approvalId'],
        [ReleasePackageEntity, 'releasePackageId'],
        [EvolutionAuditEventEntity, 'auditId']
    ])
    let chain = Promise.resolve()
    let failReceipt = false
    const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value)
    const manager = {
        getRepository: (entity: unknown) => {
            const save = async (row: Row) => {
                if (entity === ReleasePackageEntity && row['status'] === 'published' && failReceipt) {
                    failReceipt = false
                    throw new Error('TEST: receipt persistence unavailable')
                }
                const rows = tables.get(entity) ?? []
                const key = keys.get(entity)!
                const index = rows.findIndex(
                    (item) =>
                        item[key] === row[key] &&
                        item['tenantId'] === row['tenantId'] &&
                        item['organizationId'] === row['organizationId']
                )
                if (index >= 0) rows[index] = structuredClone(row)
                else rows.push(structuredClone(row))
                tables.set(entity, rows)
                return structuredClone(row)
            }
            const find = async ({ where }: { where: Row }) =>
                structuredClone((tables.get(entity) ?? []).filter((row) => matches(row, where)))
            return {
                create: (row: Row) => row,
                save,
                find,
                findOne: async (options: { where: Row }) => (await find(options))[0] ?? null,
                findOneBy: async (where: Row) => (await find({ where }))[0] ?? null,
                findOneByOrFail: async (where: Row) => {
                    const row = (await find({ where }))[0]
                    if (!row) throw new Error('Missing row')
                    return row
                },
                createQueryBuilder: () => ({
                    insert: () => ({
                        values: (row: Row) => ({
                            orIgnore: () => ({
                                execute: async () => {
                                    const duplicate = (tables.get(entity) ?? []).some(
                                        (item) =>
                                            item['requestId'] === row['requestId'] &&
                                            item['targetId'] === row['targetId'] &&
                                            item['tenantId'] === row['tenantId'] &&
                                            item['organizationId'] === row['organizationId']
                                    )
                                    if (!duplicate) await save(row)
                                }
                            })
                        })
                    })
                })
            }
        }
    }
    const db = {
        manager,
        getRepository: manager.getRepository,
        transaction: async (work: (input: typeof manager) => Promise<unknown>) => {
            const previous = chain
            let release!: () => void
            chain = new Promise<void>((resolve) => {
                release = resolve
            })
            await previous
            const snapshot = new Map([...tables].map(([table, rows]) => [table, structuredClone(rows)]))
            try {
                return await work(manager)
            } catch (error) {
                tables = snapshot
                throw error
            } finally {
                release()
            }
        }
    } as unknown as DataSource
    const records = new EvolutionChangeStore(db)
    let receipt: EvolutionPublicationReceipt | undefined
    let versions = 0
    let current = true
    const provider = {
        prepare: jest.fn(async () => structuredClone(initial.candidate!)),
        evaluate: jest.fn(async (op) => ({
            ...structuredClone(initial.evaluation!),
            evidenceHash: op.change.evidenceHash,
            checks: [
                { ...initial.evaluation!.checks[0], passed: 'Hi {{name}}'.replace('{{name}}', 'Ada') === 'Hi Ada' }
            ]
        })),
        describe: jest.fn(async () => ({ title: 'Greeting', resourceLabel: 'Template' })),
        authorizePublication: jest.fn(async () => undefined),
        validateCurrent: jest.fn(async () => ({ valid: current, reasons: [] })),
        publish: jest.fn(async (operation) => {
            if (receipt) return receipt
            if (!current) throw new Error('TEST: baseline changed')
            versions++
            receipt = {
                receiptId: 'WRITE-1',
                changeId: operation.change.changeId,
                candidateHash: operation.change.candidate!.artifact.hash,
                approvalId: operation.change.approval!.approvalId,
                resource: { resourceId: 'TEMPLATE-V2', version: '2', hash: 'CANDIDATE' },
                completedAt: '2026-09-08T00:00:03Z'
            }
            return receipt
        })
    } satisfies EvolutionChangeProvider
    const policy = structuredClone(descriptor)
    const providers = {
        get: () => ({
            descriptor: policy,
            draftBuilder: provider,
            checkEvaluator: provider,
            versionPublisher: provider,
            presenter: provider
        })
    } as unknown as EvolutionTargetProviderRegistry
    const queue = { enqueue: jest.fn() } as unknown as ManagedQueueService
    const strategies = new EvolutionStrategyService(providers)
    strategy.hash = strategies.freeze(initial.targetId, 'org', definition.id, 'business_evidence').hash
    initial.evaluation!.strategyHash = strategy.hash
    initial.evaluation!.assessment = 'tested'
    if (seed) {
        seed.strategy.hash = strategy.hash
        seed.evaluation!.strategyHash = strategy.hash
        await records.save(db.manager, identity, structuredClone(seed), descriptor)
    }
    const store = {
        saveJob: jest.fn(),
        updateJobStatus: jest.fn(),
        findLearningEvents: jest.fn<Promise<Array<{ value: LearningEvent }>>, [unknown, string[]]>()
    }
    const quality = new AgentEvolutionQualityGovernanceService()
    const evaluations = new EvolutionEvaluationExecutor(store as never, quality, records)
    const service = new EvolutionChangeService(
        db,
        providers,
        store as never,
        records,
        strategies,
        evaluations,
        { package: jest.fn() } as never,
        quality,
        { enqueue: jest.fn() } as never
    )
    const review = (decision: 'approved' | 'rejected' = 'approved') =>
        service.decide({
            ...identity,
            candidateHash: 'CANDIDATE',
            evaluationRunId: 'EVAL',
            decision,
            reason: 'Verified independent fixture'
        })
    return {
        db,
        service,
        records,
        review,
        provider,
        policy,
        store,
        rows: (entity: unknown) => tables.get(entity) ?? [],
        tables: () => [...tables.keys()],
        versions: () => versions,
        stale: () => {
            current = false
        },
        failReceipt: () => {
            failReceipt = true
        }
    }
}

it('uses only canonical lifecycle entities, with no aggregate snapshot or fabricated replay metrics', async () => {
    const h = await harness()
    await h.review()
    await h.service.publish(identity)
    expect(new Set(h.tables())).toEqual(
        new Set([
            ImprovementProposalEntity,
            EvolutionCandidateEntity,
            EvaluationRunEntity,
            ApprovalDecisionEntity,
            ReleasePackageEntity,
            EvolutionAuditEventEntity
        ])
    )
    const proposal = h.rows(ImprovementProposalEntity)[0].value
    expect(proposal).not.toHaveProperty('candidate')
    expect(proposal).not.toHaveProperty('evaluation')
    expect(proposal).not.toHaveProperty('receipt')
    expect(h.rows(EvaluationRunEntity)[0].value).not.toHaveProperty('baselineBundle')
    expect(h.rows(ReleasePackageEntity)[0].value).not.toHaveProperty('canaryPercent')
    expect((await h.service.get(identity)).receipt?.resource.version).toBe('2')
})
it('requires exact human approval and deduplicates concurrent publication callbacks', async () => {
    const h = await harness()
    await expect(h.service.publish(identity)).rejects.toThrow()
    await expect(
        h.service.decide({
            ...identity,
            candidateHash: 'wrong',
            evaluationRunId: 'EVAL',
            decision: 'approved',
            reason: 'No'
        })
    ).rejects.toThrow()
    await h.review()
    const [a, b] = await Promise.all([h.service.publish(identity), h.service.publish(identity)])
    expect(a.receipt).toEqual(b.receipt)
    expect(h.versions()).toBe(1)
    expect(h.rows(ReleasePackageEntity)).toHaveLength(1)
})
it('persists publishing intent and recovers a committed provider version after receipt-save failure', async () => {
    const h = await harness()
    await h.review()
    h.failReceipt()
    await expect(h.service.publish(identity)).rejects.toThrow('receipt persistence unavailable')
    expect((await h.service.get(identity)).status).toBe('publishing')
    h.stale()
    expect((await h.service.publish(identity)).receipt?.receiptId).toBe('WRITE-1')
    expect(h.versions()).toBe(1)
})
it('blocks rejected, stale-policy, stale-source and cross-organization requests', async () => {
    const h = await harness()
    await h.review('rejected')
    await expect(h.service.publish(identity)).rejects.toThrow()
    const stale = await harness()
    stale.stale()
    await expect(stale.review()).rejects.toThrow()
    const policy = await harness()
    policy.policy.strategies[0].version = '2'
    await expect(policy.review()).rejects.toThrow()
    await expect(stale.service.get({ ...identity, organizationId: 'other' })).rejects.toThrow()
    expect(h.versions() + stale.versions() + policy.versions()).toBe(0)
})
it('does not change publication state when the provider denies publishing authority', async () => {
    const h = await harness()
    await h.review()
    h.provider.authorizePublication.mockRejectedValue(new Error('Denied'))
    await expect(h.service.publish(identity)).rejects.toThrow('Denied')
    expect((await h.service.get(identity)).status).toBe('approved')
    expect(h.versions()).toBe(0)
})

it('freezes a request once, then builds and evaluates against feedback without document or product fields', async () => {
    const h = await harness(null)
    const input: SubmitEvolutionChange = {
        strategyId: definition.id,
        sourceKind: 'business_evidence',
        ...identity,
        targetId: initial.targetId,
        requestId: 'new-request',
        scope: initial.scope,
        baseline: initial.baseline,
        evidence: initial.evidence
    }
    const first = await h.service.prepare(input)
    const repeat = await h.service.prepare(input)
    expect(repeat.changeId).toBe(first.changeId)
    expect(h.rows(ImprovementProposalEntity)).toHaveLength(1)
    await expect(
        h.service.prepare({ ...input, evidence: [{ ...input.evidence[0], hash: 'changed' }] })
    ).rejects.toThrow()
    await h.service.process({ ...identity, changeId: first.changeId })
    const result = await h.service.get({ ...identity, changeId: first.changeId })
    expect(result.status).toBe('pending_approval')
    expect(result.evaluation?.checks[0].passed).toBe(true)
    expect(result.evidence[0].locator).toBeUndefined()
    expect(result.scope.dimensions).toBeUndefined()
    expect(h.rows(EvolutionCandidateEntity)).toHaveLength(1)
    expect(h.rows(EvaluationRunEntity)).toHaveLength(1)
})
it('does not overwrite a frozen evaluation with changed results', async () => {
    const h = await harness()
    await expect(
        h.records.saveEvaluation(h.db.manager, identity, initial, { ...initial.evaluation!, passed: false })
    ).rejects.toThrow()
    expect((await h.service.get(identity)).evaluation).toEqual(initial.evaluation)
})
it('keeps audit data readable when plugin presentation is unavailable', async () => {
    const h = await harness()
    h.provider.describe.mockRejectedValue(new Error('source unavailable'))
    const result = await h.service.get(identity)
    expect(result.presentationUnavailable).toBe(true)
    expect(result.candidate).toEqual(initial.candidate)
    expect(h.versions()).toBe(0)
})

it('requires an explicitly declared policy for the current provider contract', async () => {
    const h = await harness(null)
    h.policy.strategies = []
    await expect(
        h.service.prepare({
            strategyId: definition.id,
            sourceKind: 'business_evidence',
            ...identity,
            targetId: initial.targetId,
            requestId: 'NO-POLICY',
            scope: initial.scope,
            baseline: initial.baseline,
            evidence: initial.evidence
        })
    ).rejects.toThrow()
    expect(h.tables()).toHaveLength(0)
    expect(h.provider.prepare).not.toHaveBeenCalled()
})

it('reads historical presentation after a policy revision without permitting publication under that revision', async () => {
    const h = await harness()
    h.policy.strategies[0].version = 'template/2'
    expect((await h.service.get(identity)).presentation?.title).toBe('Greeting')
    await expect(h.review()).rejects.toThrow()
})

it('human proposals skip learning and quality tests but still require an exact human decision', async () => {
    const h = await harness(null)
    h.policy.strategies = [structuredClone(HUMAN_PROPOSAL_STRATEGY)]
    const change = await h.service.prepare({
        ...identity,
        strategyId: 'human_proposal',
        sourceKind: 'manual',
        targetId: initial.targetId,
        requestId: 'HUMAN-1',
        scope: initial.scope,
        baseline: initial.baseline,
        evidence: []
    })
    const target = { ...identity, changeId: change.changeId }
    await h.service.process(target)
    const assessed = await h.service.get(target)
    expect(h.provider.evaluate).not.toHaveBeenCalled()
    expect(assessed.evaluation?.assessment).toBe('not_applicable')
    expect(assessed.evaluation?.checks).toEqual([])
    expect(assessed.stages.find((step) => step.key === 'learning')?.status).toBe('not_applicable')
    await expect(h.service.publish(target)).rejects.toThrow()
    await h.service.decide({
        ...target,
        candidateHash: assessed.candidate!.artifact.hash,
        evaluationRunId: assessed.evaluation!.runId,
        decision: 'approved',
        reason: 'Human review of the exact template change'
    })
    expect((await h.service.publish(target)).status).toBe('published')
    expect(h.versions()).toBe(1)
})
it('a caller cannot select the human shortcut unless the target allows it', async () => {
    const h = await harness(null)
    await expect(
        h.service.prepare({
            ...identity,
            strategyId: 'human_proposal',
            sourceKind: 'manual',
            targetId: initial.targetId,
            requestId: 'HUMAN-2',
            scope: initial.scope,
            baseline: initial.baseline,
            evidence: []
        })
    ).rejects.toThrow()
    expect(h.provider.prepare).not.toHaveBeenCalled()
})

it('composes a real learning gate with target draft, domain checks and direct version publication', async () => {
    const h = await harness(null)
    const learned = {
        ...definition,
        id: 'learned_direct',
        inputs: ['learning_events' as const],
        evidenceKinds: ['execution' as const],
        learning: FEEDBACK_LEARNING_STRATEGY.learning
    }
    h.policy.strategies = [learned]
    const events: LearningEvent[] = ['a', 'b', 'b'].map((subjectRef, index) => ({
        eventId: `LE-${index}`,
        idempotencyKey: `LE-${index}`,
        eventType: 'prediction_reviewed',
        schemaVersion: '1',
        eventTime: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        scope: initial.scope,
        targetId: initial.targetId,
        subjectRef,
        decisionPoint: 'greeting',
        inputFingerprint: `input-${index}`,
        predictionSummary: 'Hello',
        finalOutcomeSummary: 'Hello Ada',
        confidence: 1,
        reasonCodes: ['human_correction'],
        capabilityVersionBundleId: 'bundle',
        bundleHash: 'bundle-hash',
        trustLevel: 'L2',
        classification: 'internal',
        redactionStatus: 'not_required'
    }))
    const input: SubmitEvolutionChange = {
        ...identity,
        strategyId: learned.id,
        sourceKind: 'learning_events',
        targetId: initial.targetId,
        requestId: 'LEARNED-DIRECT',
        scope: initial.scope,
        baseline: initial.baseline,
        learningEventIds: events.map((e) => e.eventId),
        evidence: events.map((e) => ({
            kind: 'execution',
            subjectKey: e.subjectRef,
            uri: `evolution-event:${e.eventId}`,
            version: e.schemaVersion,
            hash: digest(e)
        }))
    }
    h.store.findLearningEvents.mockResolvedValue(events.slice(0, 2).map((value) => ({ value })))
    await expect(h.service.prepare(input)).rejects.toThrow()
    h.store.findLearningEvents.mockResolvedValue([...events].reverse().map((value) => ({ value })))
    const created = await h.service.prepare(input)
    const target = { ...identity, changeId: created.changeId }
    await h.service.process(target)
    const result = await h.service.get(target)
    expect(result.stages.find((s) => s.key === 'learning')?.status).toBe('passed')
    expect(result.evaluation?.checks).toHaveLength(1)
    expect(h.provider.prepare).toHaveBeenCalledTimes(1)
    await h.service.decide({
        ...target,
        candidateHash: result.candidate!.artifact.hash,
        evaluationRunId: result.evaluation!.runId,
        decision: 'approved',
        reason: 'Reviewed learned template candidate'
    })
    expect((await h.service.publish(target)).status).toBe('published')
    expect(h.versions()).toBe(1)
})

it.each([true, false])(
    'persists each composed evaluation and aggregates the actual blocking result (%s)',
    async (secondPassed) => {
        const h = await harness(null)
        h.policy.strategies[0].evaluations = ['schema', 'behavior'].map((key) => ({
            ...definition.evaluations[0],
            key
        }))
        let number = 0
        h.provider.evaluate.mockImplementation(async (operation) => {
            number++
            const passed = number === 1 || secondPassed
            return {
                ...structuredClone(initial.evaluation!),
                runId: `RUN-${number}`,
                evidenceHash: operation.change.evidenceHash,
                passed,
                checks: [{ ...initial.evaluation!.checks[0], passed }]
            }
        })
        const created = await h.service.prepare({
            ...identity,
            strategyId: definition.id,
            sourceKind: 'business_evidence',
            targetId: initial.targetId,
            requestId: 'COMPOSED',
            scope: initial.scope,
            baseline: initial.baseline,
            evidence: initial.evidence
        })
        const target = { ...identity, changeId: created.changeId }
        await h.service.process(target)
        const result = await h.service.get(target)
        expect(result.evaluation?.passed).toBe(secondPassed)
        expect(result.evaluation?.checks.map((check) => check.checkId)).toEqual(['schema:render', 'behavior:render'])
        expect(result.evaluation?.evaluationRuns.map((run) => run.runId)).toEqual(['RUN-1', 'RUN-2'])
        expect(h.rows(EvaluationRunEntity)).toHaveLength(3)
        expect(h.rows(EvaluationRunEntity).map((row) => row['runId'])).toEqual(
            expect.arrayContaining(['RUN-1', 'RUN-2'])
        )
        if (!secondPassed)
            await expect(
                h.service.decide({
                    ...target,
                    candidateHash: result.candidate!.artifact.hash,
                    evaluationRunId: result.evaluation!.runId,
                    decision: 'approved',
                    reason: 'Cannot bypass the behavior check'
                })
            ).rejects.toThrow()
    }
)
