import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm'
import type { ReleaseDeployment } from '@xpert-ai/contracts'
import { AgentEvolutionGovernanceService } from './agent-evolution-governance.service'
import {
    AgentEvolutionReleaseGatePolicyService,
    resolveEvolutionReleaseGatePolicy
} from './agent-evolution-release-gate-policy.service'
import { AgentEvolutionQualityGovernanceService } from './agent-evolution-quality-governance.service'
import { EvolutionChangeService } from '../changes/change.service'
import { AgentEvolutionService } from './agent-evolution.service'
import { AgentEvolutionStore } from './agent-evolution.store'
import {
    AGENT_EVOLUTION_ENTITIES,
    ActiveCapabilityPointerEntity,
    EvaluationRunEntity,
    LearningEventEntity,
    ReleaseDeploymentEntity,
    ReleasePackageEntity
} from '../entities'
import { ConformanceFieldMappingProvider, ConformanceIntentRoutingProvider } from '../providers'

const runPersistenceIntegration = process.env.AGENT_EVOLUTION_PERSISTENCE_E2E === '1'
const schemaName = `agent_evolution_test_${process.pid}`
const tenantId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'
const databaseOptions = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? 'ocap_password',
    database: process.env.DB_NAME ?? 'ocap'
}

@Entity('tenant_fixture')
class Tenant {
    @PrimaryColumn('uuid')
    id: string
}

@Entity('organization_fixture')
class Organization {
    @PrimaryColumn('uuid')
    id: string
}

@Entity('user_fixture')
class User {
    @PrimaryColumn('uuid')
    id: string

    @Column({ type: 'uuid', nullable: true })
    tenantId?: string
}

const persistenceDescribe = runPersistenceIntegration ? describe : describe.skip

persistenceDescribe('AgentEvolutionService PostgreSQL persistence integration', () => {
    let moduleRef: TestingModule
    let dataSource: DataSource

    beforeAll(async () => {
        const schemaBootstrap = new DataSource({
            type: 'postgres',
            ...databaseOptions
        })
        await schemaBootstrap.initialize()
        try {
            await schemaBootstrap.query(`CREATE SCHEMA "${schemaName}"`)
        } finally {
            await schemaBootstrap.destroy()
        }

        const fieldProvider = new ConformanceFieldMappingProvider()
        const routingProvider = new ConformanceIntentRoutingProvider()
        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    ...databaseOptions,
                    schema: schemaName,
                    entities: [...AGENT_EVOLUTION_ENTITIES, Tenant, Organization, User],
                    synchronize: true,
                    logging: false
                }),
                TypeOrmModule.forFeature(AGENT_EVOLUTION_ENTITIES)
            ],
            providers: [
                AgentEvolutionStore,
                AgentEvolutionService,
                AgentEvolutionGovernanceService,
                AgentEvolutionReleaseGatePolicyService,
                { provide: AgentEvolutionQualityGovernanceService, useValue: {} },
                { provide: EvolutionChangeService, useValue: {} },
                {
                    provide: EvolutionTargetProviderRegistry,
                    useValue: {
                        listDescriptors: () => [fieldProvider.descriptor, routingProvider.descriptor],
                        get: (targetId: string) => {
                            if (targetId === fieldProvider.descriptor.targetId) return fieldProvider
                            if (targetId === routingProvider.descriptor.targetId) return routingProvider
                            throw new Error(`Unknown target '${targetId}'`)
                        }
                    }
                }
            ]
        }).compile()
        dataSource = moduleRef.get(DataSource)
        await dataSource.getRepository(Tenant).save({ id: tenantId })
        await dataSource.getRepository(Organization).save({ id: organizationId })
    }, 30000)

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
        }
        await moduleRef?.close()
    })

    it('persists the complete governed workflow and atomic pointer state in an isolated schema', async () => {
        const service = moduleRef.get(AgentEvolutionService)
        const result = await service.runConformanceSimulation({
            tenantId,
            organizationId,
            actorId: '00000000-0000-4000-8000-000000000003',
            actorRole: 'governance_reviewer'
        })

        expect(result.gatePassed).toBe(true)
        expect(result.persistence).toMatchObject({ verified: true, rowCount: 23 })
        expect(result.persistence.tables).toHaveLength(13)
        expect(await dataSource.getRepository(LearningEventEntity).count()).toBe(4)
        expect(await dataSource.getRepository(EvaluationRunEntity).count()).toBe(1)
        expect(await dataSource.getRepository(ReleaseDeploymentEntity).count()).toBe(2)
        const deployments = await dataSource.getRepository(ReleaseDeploymentEntity).find()
        expect(deployments.every((deployment) => deployment.value.dataSource === 'deterministic_replay')).toBe(true)
        expect(deployments.flatMap((deployment) => deployment.value.observations)).toHaveLength(10)
        expect(
            (
                await dataSource
                    .getRepository(ReleasePackageEntity)
                    .findOneByOrFail({ releasePackageId: result.releasePackageId })
            ).status
        ).toBe('active')
        const pointer = await dataSource
            .getRepository(ActiveCapabilityPointerEntity)
            .findOneByOrFail({ targetId: result.targetId })
        expect(pointer.value).toMatchObject({
            activeVersionId: result.activeVersionId,
            rollbackVersionId: result.previousVersionId,
            revision: 2
        })

        const store = moduleRef.get(AgentEvolutionStore)
        await expect(
            store.activatePointerCas({
                tenant: { tenantId, organizationId },
                pointerId: pointer.pointerId,
                expectedRevision: 1,
                expectedVersionId: result.previousVersionId,
                newVersionId: 'stale-writer-version',
                releasePackageId: result.releasePackageId,
                actorId: '00000000-0000-4000-8000-000000000004',
                actorRole: 'governance_reviewer',
                occurredAt: new Date().toISOString()
            })
        ).rejects.toThrow('Active Pointer CAS conflict')
        expect(
            (
                await dataSource
                    .getRepository(ActiveCapabilityPointerEntity)
                    .findOneByOrFail({ pointerId: pointer.pointerId })
            ).value
        ).toMatchObject({ activeVersionId: result.activeVersionId, revision: 2 })
        const changed = await store.rollbackPointerCas({
            tenant: { tenantId, organizationId },
            pointerId: pointer.pointerId,
            expectedRevision: 2,
            expectedVersionId: result.activeVersionId,
            rollbackVersionId: result.previousVersionId,
            releasePackageId: result.releasePackageId,
            actorId: '00000000-0000-4000-8000-000000000004',
            actorRole: 'governance_reviewer',
            occurredAt: new Date().toISOString()
        })
        expect(changed).toMatchObject({ activeVersionId: result.previousVersionId, revision: 3 })
        const audits = await store.listAuditEvents(
            { tenantId, organizationId },
            { releasePackageId: result.releasePackageId }
        )
        expect(audits.items.some((a) => a.action === 'active_pointer.cas_rolled_back')).toBe(true)
        expect(
            (await store.listAuditEvents({ tenantId, organizationId }, { releasePackageId: 'unrelated' })).total
        ).toBe(0)
    }, 30000)

    it('aggregates only matching telemetry, preserves unknown baselines and calculates nearest-rank P95', async () => {
        const store = moduleRef.get(AgentEvolutionStore)
        const tenant = { tenantId, organizationId }
        const scope = { type: 'project' as const, key: 'automotive-project', dimensions: { plant: 'north' } }
        const now = new Date().toISOString()
        const targetId = 'telemetry-test'
        const release = await store.saveRelease(tenant, {
            publicationKind: 'staged_rollout',
            targetId,
            scope,
            releasePackageId: 'telemetry-release',
            candidateId: 'candidate',
            candidateHash: 'candidate-hash',
            targetVersionId: 'v2',
            rollbackVersionId: 'v1',
            evaluationRunId: 'eval',
            status: 'shadow',
            approvalIds: ['approval'],
            artifactHash: 'candidate-hash',
            providerKey: targetId,
            providerVersion: '1',
            shadowMinimumSamples: 1,
            canaryPercent: 0,
            createdAt: now,
            createdBy: 'tester'
        })
        await store.saveDeployment(tenant, {
            deploymentId: 'telemetry-deployment',
            releasePackageId: release.releasePackageId,
            channel: 'shadow',
            scope,
            status: 'shadow',
            dataSource: 'runtime_telemetry',
            sampleCount: 0,
            candidateAccuracy: 0,
            severeErrors: 0,
            canaryPercent: 0,
            observations: [],
            startedAt: now
        })
        for (const foreignScope of [
            { ...scope, key: 'other-project' },
            { ...scope, dimensions: { plant: 'south' } }
        ]) {
            expect(await store.listDeploymentsForTarget(tenant, targetId, foreignScope)).toEqual([])
        }
        await store.saveBundle(tenant, {
            bundleId: 'bundle',
            bundleHash: 'hash',
            executionMode: 'shadow',
            createdAt: now,
            items: [
                {
                    targetId,
                    versionId: 'v2',
                    artifactHash: 'candidate-hash',
                    providerKey: targetId,
                    providerVersion: '1'
                }
            ]
        })
        const sample = {
            observationId: 'first',
            executionId: 'run',
            targetId,
            scope,
            bundleId: 'bundle',
            deploymentId: 'telemetry-deployment',
            subjectKey: 'motor',
            channel: 'shadow' as const,
            success: true,
            severeError: false,
            latencyMs: 250,
            observedAt: now,
            createdAt: now
        }
        await expect(
            store.saveRuntimeObservation(tenant, { ...sample, scope: { ...scope, key: 'other-project' } })
        ).rejects.toThrow()
        await expect(
            store.saveRuntimeObservation(tenant, { ...sample, bundleId: 'unrelated-bundle' })
        ).rejects.toThrow()
        await Promise.all([store.saveRuntimeObservation(tenant, sample), store.saveRuntimeObservation(tenant, sample)])
        for (let i = 1; i < 20; i++) {
            await store.saveRuntimeObservation(tenant, {
                ...sample,
                observationId: 'sample-' + i,
                latencyMs: 1,
                ...(i <= 2 ? { baselineSuccess: i === 1 } : {})
            })
        }
        const scoped = await store.listRuntimeObservations(tenant, {
            releasePackageId: release.releasePackageId,
            page: 2,
            pageSize: 8
        })
        expect(scoped.total).toBe(20)
        expect(scoped.items).toHaveLength(8)
        expect(scoped.items.every((o) => o.deploymentId === 'telemetry-deployment')).toBe(true)
        expect((await store.listRuntimeObservations(tenant, { releasePackageId: 'another-release' })).total).toBe(0)
        expect(
            (
                await store.listRuntimeObservations(
                    { ...tenant, organizationId: null },
                    { releasePackageId: release.releasePackageId }
                )
            ).total
        ).toBe(0)
        const [deployment] = await store.listDeploymentsForTarget(tenant, targetId, scope)
        expect(deployment.value.sampleCount).toBe(20)
        expect(deployment.value.observations[0]).toMatchObject({ baselineAccuracy: null, pairedBaselineSamples: 0 })
        expect(deployment.value.observations.at(-1)).toMatchObject({
            baselineAccuracy: 0.5,
            pairedBaselineSamples: 2,
            p95LatencyMs: 1
        })
    }, 30000)
    it('installs, pauses, gates each canary, activates and rolls back a telemetry-backed package', async () => {
        const store = moduleRef.get(AgentEvolutionStore)
        const governance = moduleRef.get(AgentEvolutionGovernanceService)
        const tenant = { tenantId, organizationId }
        const ctx = {
            ...tenant,
            actorId: '00000000-0000-4000-8000-000000000004',
            actorRole: 'administrator',
            approvalAuthority: 'administrator' as const
        }
        const descriptor = new ConformanceFieldMappingProvider().descriptor
        const targetId = descriptor.targetId,
            id = 'release-flow',
            now = new Date().toISOString()
        const scope = { type: 'organization' as const, key: 'isolated-rollout-scope' }
        const policy = resolveEvolutionReleaseGatePolicy({
            production: false,
            values: { AGENT_EVOLUTION_GATE_PROFILE: 'manual_test' }
        })
        await store.savePointer(tenant, {
            pointerId: 'flow-ptr',
            targetId,
            scope,
            channel: 'production',
            revision: 1,
            activeVersionId: 'flow-base',
            updatedAt: now,
            updatedBy: ctx.actorId
        })
        await store.saveRelease(tenant, {
            publicationKind: 'staged_rollout',
            releasePackageId: id,
            candidateId: 'flow-candidate',
            candidateHash: 'flow-hash',
            targetId,
            targetVersionId: 'flow-next',
            rollbackVersionId: 'flow-base',
            evaluationRunId: 'flow-eval',
            scope,
            status: 'approved',
            approvalIds: ['flow-approval'],
            artifactHash: 'flow-hash',
            providerKey: descriptor.providerKey,
            providerVersion: descriptor.providerVersion,
            gatePolicy: policy,
            shadowMinimumSamples: 1,
            canaryPercent: 0,
            createdAt: now,
            createdBy: ctx.actorId
        })
        await store.saveBundle(tenant, {
            bundleId: 'flow-bundle',
            bundleHash: 'flow-hash',
            executionMode: 'canary',
            createdAt: now,
            items: [
                {
                    targetId,
                    versionId: 'flow-next',
                    artifactHash: 'flow-hash',
                    providerKey: descriptor.providerKey,
                    providerVersion: descriptor.providerVersion
                }
            ]
        })
        const review = (s: ReleaseDeployment) =>
            store.saveRuntimeObservation(tenant, {
                targetId,
                scope,
                observationId: 'obs-' + s.deploymentId,
                executionId: 'exec-' + s.deploymentId,
                bundleId: 'flow-bundle',
                deploymentId: s.deploymentId,
                subjectKey: 'flow-subject',
                channel: s.channel,
                success: true,
                severeError: false,
                latencyMs: 1,
                observedAt: now,
                createdAt: now
            })
        await governance.installRelease(ctx, id)
        await governance.startShadow(ctx, id)
        await governance.pauseRelease(ctx, id)
        const shadow = await governance.startShadow(ctx, id)
        await expect(governance.startCanary(ctx, id, { canaryPercent: 5 })).rejects.toThrow()
        await review(shadow)
        await expect(governance.startCanary(ctx, id, { canaryPercent: 25 })).rejects.toThrow()
        for (const percent of [5, 25, 50] as const) {
            const stage = await governance.startCanary(ctx, id, { canaryPercent: percent })
            await expect(governance.activateProduction(ctx, id)).rejects.toThrow()
            await review(stage)
        }
        const active = await governance.activateProduction(ctx, id)
        expect(active).toMatchObject({ activeVersionId: 'flow-next', revision: 2 })
        const prior = (await store.findRelease(tenant, id))!.value
        await store.saveRelease(tenant, { ...prior, releasePackageId: 'obsolete', status: 'paused' })
        await expect(governance.startShadow(ctx, 'obsolete')).rejects.toThrow('Production pointer no longer matches')
        const production = (await store.listDeploymentsForRelease(tenant, id)).find(
            (d) => d.channel === 'production'
        )!.value
        await review(production)
        expect((await store.listRuntimeObservations(tenant, { releasePackageId: id })).total).toBe(5)
        expect(await governance.rollbackProduction(ctx, id)).toMatchObject({
            activeVersionId: 'flow-base',
            revision: 3
        })
        expect((await store.findRelease(tenant, id))?.status).toBe('rolled_back')
    }, 30000)
})
