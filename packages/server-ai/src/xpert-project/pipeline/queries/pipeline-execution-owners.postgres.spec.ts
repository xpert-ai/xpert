import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { ProjectPipelineNativeGrantEntity, ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import { pipelineExecutionOwners } from './pipeline-execution-owners'
const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
if (url && !new URL(url).pathname.includes('test')) throw new Error('Isolated test database required')
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const base = {
    id: { ...uuid, primary: true },
    tenantId: uuid,
    organizationId: { ...uuid, nullable: true },
    projectId: uuid,
    instanceId: uuid,
    roundId: uuid,
    nodeInstanceId: uuid,
    deletedAt: { type: 'timestamptz' as const, nullable: true, deleteDate: true }
}
integration('persisted execution owners in the authorized transaction', () => {
    let db: DataSource
    const schema = `execution_owners_${randomUUID().replace(/-/g, '')}`
    const context = {
        projectId: randomUUID(),
        actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    }
    const instanceId = randomUUID(),
        roundId = randomUUID(),
        nodeInstanceId = randomUUID(),
        executionId = randomUUID()
    const scope = {
        tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId,
        projectId: context.projectId,
        instanceId,
        roundId,
        nodeInstanceId
    }
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [
                new EntitySchema<ProjectPipelineNativeGrantEntity>({
                    name: 'ProjectPipelineNativeGrantEntity',
                    target: ProjectPipelineNativeGrantEntity,
                    columns: { ...base, executionId: uuid, consumedAt: { type: 'timestamptz', nullable: true } }
                }),
                new EntitySchema<ProjectPipelineOperationEntity>({
                    name: 'ProjectPipelineOperationEntity',
                    target: ProjectPipelineOperationEntity,
                    columns: { ...base, kind: { type: 'varchar' } }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        await db.getRepository(ProjectPipelineNativeGrantEntity).clear()
        await db.getRepository(ProjectPipelineOperationEntity).clear()
    })
    const grant = (
        patch: Partial<
            Pick<
                ProjectPipelineNativeGrantEntity,
                | 'projectId'
                | 'tenantId'
                | 'organizationId'
                | 'instanceId'
                | 'roundId'
                | 'executionId'
                | 'consumedAt'
                | 'deletedAt'
            >
        > = {}
    ) =>
        db.getRepository(ProjectPipelineNativeGrantEntity).insert({
            id: randomUUID(),
            ...scope,
            executionId,
            consumedAt: new Date(),
            ...patch
        })
    it('excludes unconsumed, soft-deleted and foreign project, tenant, organization or instance grants', async () => {
        await grant()
        await grant({ consumedAt: null })
        await grant({ deletedAt: new Date() })
        await grant({ projectId: randomUUID() })
        await grant({ tenantId: randomUUID() })
        await grant({ organizationId: randomUUID() })
        await grant({ instanceId: randomUUID() })
        const owners = await db.transaction('REPEATABLE READ', (manager) =>
            pipelineExecutionOwners(manager, context, instanceId, 'provider')
        )
        expect(owners).toEqual([{ roundId, nodeInstanceId, agentExecutionId: executionId }])
    })
    it('preserves exact ownership across rounds and separates null organization scope', async () => {
        await grant()
        const oldRound = randomUUID(),
            oldExecution = randomUUID()
        await grant({ roundId: oldRound, executionId: oldExecution })
        await grant({ organizationId: null })
        expect(await pipelineExecutionOwners(db.manager, context, instanceId, 'provider')).toEqual(
            expect.arrayContaining([
                { roundId, nodeInstanceId, agentExecutionId: executionId },
                { roundId: oldRound, nodeInstanceId, agentExecutionId: oldExecution }
            ])
        )
        expect(
            await pipelineExecutionOwners(
                db.manager,
                { ...context, actor: { ...context.actor, organizationId: null } },
                instanceId,
                'provider'
            )
        ).toHaveLength(1)
    })
    it('returns managed operations only, not policies or subscriptions, and keeps exact IDs for retries', async () => {
        const first = randomUUID(),
            retry = randomUUID()
        const insert = (
            id: string,
            kind: ProjectPipelineOperationEntity['kind'],
            patch: Partial<
                Pick<ProjectPipelineOperationEntity, 'projectId' | 'tenantId' | 'organizationId' | 'instanceId'>
            > = {}
        ) => db.getRepository(ProjectPipelineOperationEntity).insert({ id, ...scope, kind, ...patch })
        await insert(first, 'operation')
        await insert(retry, 'operation')
        await insert(randomUUID(), 'policy')
        await insert(randomUUID(), 'subscription')
        await insert(randomUUID(), 'operation', { projectId: randomUUID() })
        expect(await pipelineExecutionOwners(db.manager, context, instanceId, 'platform')).toEqual(
            expect.arrayContaining([
                { operationId: first, roundId, nodeInstanceId },
                { operationId: retry, roundId, nodeInstanceId }
            ])
        )
        expect(await pipelineExecutionOwners(db.manager, context, instanceId, 'platform')).toHaveLength(2)
    })
})
