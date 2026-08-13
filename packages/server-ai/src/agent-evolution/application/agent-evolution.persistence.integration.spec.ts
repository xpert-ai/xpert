import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm'
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
    }, 30000)
})
