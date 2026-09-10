import { evidenceDrivenStrategy, HUMAN_PROPOSAL_STRATEGY } from '@xpert-ai/contracts'
/** Isolated conformance fixture: demonstrates feedback-driven version changes without business schemas. */
import { Injectable, NotFoundException } from '@nestjs/common'
import { environment } from '@xpert-ai/server-config'
import type {
    CapabilityVersion,
    EvolutionChangeOperation,
    EvolutionChangeProvider,
    EvolutionProviderContext,
    EvolutionTargetProvider
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderStrategy } from '@xpert-ai/plugin-sdk'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { hashEvolutionValue } from '../domain/evolution-hash'
import { changeError } from '../changes/change.errors'

export const CONFORMANCE_TEMPLATE_TARGET = 'conformance.template_version'
const feedback = { text: 'Greet the named recipient instead of an anonymous greeting.', version: '1' }
const template = { body: 'Hello {{name}}', format: 'plain-text' }

export function assertTemplateConformanceEnabled() {
    if (environment.production && process.env.AGENT_EVOLUTION_ENABLE_CONFORMANCE !== 'true')
        throw new NotFoundException()
}

@Injectable()
@EvolutionTargetProviderStrategy(CONFORMANCE_TEMPLATE_TARGET)
export class ConformanceTemplateProvider implements EvolutionTargetProvider, EvolutionChangeProvider {
    readonly descriptor = {
        targetId: CONFORMANCE_TEMPLATE_TARGET,
        targetType: 'test_fixture',
        displayName: 'Conformance greeting template',
        providerKey: CONFORMANCE_TEMPLATE_TARGET,
        providerVersion: '1.0.0',
        artifactSchemaVersion: '1',
        supportedScopes: ['organization' as const],
        riskLevel: 'R1' as const,
        metricSetId: 'template.render.v1',
        capabilities: {
            candidateBuild: true,
            replay: false,
            shadow: false,
            canary: false,
            install: false,
            rollback: false
        },
        status: 'active' as const,
        strategies: [
            evidenceDrivenStrategy({
                version: 'template/2',
                effect: 'activation',
                evidenceKinds: ['feedback'],
                requiredChecks: [
                    { kind: 'render', origin: 'maintained', blocking: true },
                    { kind: 'boundary', origin: 'maintained', blocking: true }
                ]
            }),
            structuredClone(HUMAN_PROPOSAL_STRATEGY)
        ]
    }
    readonly draftBuilder = this
    readonly checkEvaluator = this
    readonly versionPublisher = this
    readonly presenter = this
    constructor(private readonly store: AgentEvolutionStore) {}

    async fixtureInput(context: EvolutionProviderContext, requestId: string) {
        this.authorizeScope(context)
        let version = await this.store.findLatestVersionForTarget(context, CONFORMANCE_TEMPLATE_TARGET)
        if (!version) {
            const artifact = artifactFor({ body: 'Hello', format: 'plain-text' })
            await this.store.saveVersion(context, {
                versionId: 'CONFORMANCE-TEMPLATE-BASE',
                targetId: CONFORMANCE_TEMPLATE_TARGET,
                sequence: 1,
                semanticVersion: '1',
                artifact,
                providerKey: CONFORMANCE_TEMPLATE_TARGET,
                providerVersion: '1.0.0',
                dependencyVersionIds: [],
                createdAt: new Date().toISOString(),
                createdBy: context.actor.actorId
            })
            version = await this.store.findVersion(context, 'CONFORMANCE-TEMPLATE-BASE')
        }
        if (!version) changeError('candidate_baseline_mismatch')
        return {
            strategyId: 'evidence_driven',
            sourceKind: 'business_evidence' as const,
            tenantId: context.tenantId,
            organizationId: context.organizationId!,
            targetId: CONFORMANCE_TEMPLATE_TARGET,
            requestId,
            scope: context.scope,
            baseline: {
                resourceId: version.value.versionId,
                version: version.value.semanticVersion,
                hash: version.value.artifact.hash
            },
            evidence: [
                {
                    kind: 'feedback' as const,
                    subjectKey: 'conformance-greeting',
                    uri: 'conformance-feedback://greeting/1',
                    version: feedback.version,
                    hash: hashEvolutionValue(feedback)
                }
            ]
        }
    }

    async describe(operation: EvolutionChangeOperation) {
        this.authorizeScope(operation.context)
        return {
            title: 'Greeting template (conformance test)',
            resourceLabel: 'Isolated feedback-driven capability',
            metrics: [
                {
                    key: 'render-cases',
                    label: { en_US: 'Template checks', zh_Hans: '模板检查' },
                    value: operation.change.evaluation?.checks.length ?? null
                }
            ],
            effect: {
                status: operation.change.receipt ? ('active' as const) : ('pending' as const),
                label: { en_US: 'Fixture version', zh_Hans: '隔离测试版本' },
                description: {
                    en_US: 'This fixture is not used by production assistants.',
                    zh_Hans: '此隔离测试版本不供生产智能体使用。'
                }
            }
        }
    }
    async prepare(operation: EvolutionChangeOperation) {
        this.authorizeScope(operation.context)
        return {
            artifact: artifactFor(template),
            baseline: operation.change.baseline,
            summary: 'Named recipient greeting',
            warnings: ['Conformance fixture only'],
            changes: [
                {
                    path: '/body',
                    operation: 'replace',
                    summary: 'Render the recipient name',
                    before: 'Hello',
                    after: template.body
                }
            ]
        }
    }
    async evaluate(operation: EvolutionChangeOperation) {
        this.authorizeScope(operation.context)
        const artifact = operation.change.candidate?.artifact
        if (!artifact || artifact.hash !== artifactFor(template).hash || artifact.uri !== artifactFor(template).uri)
            changeError('immutable_candidate_changed')
        const render = (name: string) => template.body.replace('{{name}}', name)
        const checks = [
            {
                checkId: 'named',
                title: 'Known recipient',
                kind: 'render',
                origin: 'maintained',
                passed: render('Ada') === 'Hello Ada',
                blocking: true,
                details: 'Independent expected output: Hello Ada',
                evidenceRefs: ['fixture://greeting/named']
            },
            {
                checkId: 'literal',
                title: 'Literal plain text',
                kind: 'boundary',
                origin: 'maintained',
                passed: render('<name>') === 'Hello <name>',
                blocking: true,
                details: 'Plain-text output keeps input literal',
                evidenceRefs: ['fixture://greeting/literal']
            }
        ]
        return {
            runId: `TEST-${operation.change.changeId}`,
            candidateHash: artifact.hash,
            baselineHash: operation.change.baseline.hash,
            evidenceHash: operation.change.evidenceHash,
            datasetVersion: 'greeting/1',
            datasetHash: hashEvolutionValue(['Ada', 'Hello Ada', '<name>', 'Hello <name>']),
            checks,
            readiness: [],
            passed: checks.every((item) => item.passed),
            completedAt: new Date().toISOString()
        }
    }
    async validateCurrent(operation: EvolutionChangeOperation) {
        this.authorizeScope(operation.context)
        const latest = await this.store.findLatestVersionForTarget(operation.context, CONFORMANCE_TEMPLATE_TARGET)
        const valid =
            latest?.value.versionId === operation.change.baseline.resourceId &&
            latest.value.artifact.hash === operation.change.baseline.hash &&
            operation.change.evidence.length === 1 &&
            operation.change.evidence[0].kind === 'feedback' &&
            operation.change.evidence[0].uri === 'conformance-feedback://greeting/1' &&
            operation.change.evidence[0].hash === hashEvolutionValue(feedback)
        return { valid, reasons: valid ? [] : ['Fixture baseline or feedback changed'] }
    }
    async authorizePublication(operation: EvolutionChangeOperation) {
        this.authorizeScope(operation.context)
        if (operation.context.actor.actorType !== 'human') changeError('human_approval_required')
    }
    async publish(operation: EvolutionChangeOperation) {
        await this.authorizePublication(operation)
        const { change, context } = operation
        if (!change.approval || !change.candidate || !change.evaluation?.passed) changeError('human_approval_required')
        const id = `CONFORMANCE-${change.changeId}`
        let version = await this.store.findVersion(context, id)
        if (!version) {
            if (!(await this.validateCurrent(operation)).valid) changeError('source_or_baseline_stale')
            const baseline = await this.store.findVersion(context, change.baseline.resourceId)
            const sequence = (baseline?.value.sequence ?? 0) + 1
            const value: CapabilityVersion = {
                versionId: id,
                targetId: CONFORMANCE_TEMPLATE_TARGET,
                sequence,
                semanticVersion: String(sequence),
                artifact: change.candidate.artifact,
                providerKey: CONFORMANCE_TEMPLATE_TARGET,
                providerVersion: '1.0.0',
                dependencyVersionIds: [],
                sourceCandidateId: change.changeId,
                createdAt: new Date().toISOString(),
                createdBy: context.actor.actorId
            }
            await this.store.saveVersion(context, value)
            version = await this.store.findVersion(context, id)
        }
        if (!version || version.value.artifact.hash !== change.candidate.artifact.hash)
            changeError('write_receipt_mismatch')
        return {
            receiptId: `RECEIPT-${change.changeId}`,
            changeId: change.changeId,
            candidateHash: change.candidate.artifact.hash,
            approvalId: change.approval.approvalId,
            resource: {
                resourceId: version.value.versionId,
                version: version.value.semanticVersion,
                hash: version.value.artifact.hash
            },
            completedAt: version.value.createdAt
        }
    }
    private authorizeScope(context: EvolutionProviderContext) {
        assertTemplateConformanceEnabled()
        if (
            context.targetId !== CONFORMANCE_TEMPLATE_TARGET ||
            context.scope.type !== 'organization' ||
            context.scope.key !== context.organizationId
        )
            changeError('identity_mismatch')
    }
}
function artifactFor(value: typeof template) {
    return {
        uri: `data:application/json;base64,${Buffer.from(JSON.stringify(value)).toString('base64')}`,
        hash: hashEvolutionValue(value),
        schemaVersion: '1',
        mediaType: 'application/json' as const
    }
}
