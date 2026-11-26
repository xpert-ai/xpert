jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { projectPluginDeploymentRefs } from '@xpert-ai/contracts'
import { managedPipelineFixture } from '../runtime/testing/pipeline-managed.fixture'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity
} from '../persistence/pipeline.entity'
import { ProjectPluginDeploymentStore } from './plugin-deployment.store'
import { ProjectPluginInstallationAuthorizationStore } from './plugin-installation-authorization.store'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('installation authorization transaction and dispatch fence', () => {
    const fixture = managedPipelineFixture()
    it('persists an explicit pending reason and waiting runtime through the real operation runner', async () => {
        await fixture.launch()
        const operation = (await fixture.operations())[0]
        fixture.execute.mockResolvedValue({
            status: 'pending',
            receiptKey: operation.id,
            code: 'DOMAIN_AUTHORIZATION_REQUIRED'
        })
        await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
        const saved = await fixture.db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: operation.id })
        expect(saved).toMatchObject({
            state: 'pending',
            receipt: { status: 'pending', code: 'DOMAIN_AUTHORIZATION_REQUIRED' }
        })
        const node = await fixture.db.manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            id: operation.nodeInstanceId
        })
        expect(node.projection.state.runtime).toBe('waiting')
    })
    describe('installation records', () => {
        let store: ProjectPluginInstallationAuthorizationStore
        let operation: ProjectPipelineOperationEntity
        beforeEach(async () => {
            await fixture.launch()
            operation = (await fixture.operations())[0]
            operation.handlerRef = projectPluginDeploymentRefs.operation
            operation.state = 'unknown'
            operation.dispatchStartedAt = new Date()
            operation.leaseOwner = randomUUID()
            operation.leaseFence = 1
            operation.leaseExpiresAt = new Date(Date.now() + 120000)
            await fixture.db.manager.save(operation)
            store = new ProjectPluginInstallationAuthorizationStore(
                fixture.db,
                new ProjectPluginDeploymentStore(fixture.db)
            )
        })

        it('retains one immutable authorizer under concurrent confirmations and dispatches once', async () => {
            const c = fixture.context
            const other = { ...c, actor: { ...c.actor, userId: randomUUID() } }
            const results = await Promise.all([
                store.authorize(c, operation, store.version(operation)),
                store.authorize(other, operation, store.version(operation))
            ])
            expect(results[0]).toEqual(results[1])
            const authorizations = await fixture.db.manager.findBy(ProjectPipelineEventEntity, {
                instanceId: operation.instanceId
            })
            expect(authorizations.filter((row) => row.payload.pluginInstallationAuthorization)).toHaveLength(1)
            const dispatches = await Promise.all([
                store.beginDispatch(operation.context, operation, results[0]),
                store.beginDispatch(operation.context, operation, results[1])
            ])
            expect(dispatches.filter(Boolean)).toHaveLength(1)
            const saved = await fixture.db.manager.findOneByOrFail(ProjectPipelineOperationEntity, { id: operation.id })
            expect(saved.context).toEqual(operation.context)
            expect(saved.state).toBe('unknown')
        })

        it('rejects stale input, superseded rounds and expired worker leases', async () => {
            await expect(store.authorize(fixture.context, operation, 'stale')).rejects.toThrow()
            const authorization = await store.authorize(fixture.context, operation, store.version(operation))
            await fixture.db.manager.update(ProjectPipelineOperationEntity, operation.id, { leaseFence: 2 })
            await expect(store.beginDispatch(operation.context, operation, authorization)).rejects.toThrow()
            await fixture.db.manager.update(ProjectPipelineOperationEntity, operation.id, {
                leaseFence: 1,
                leaseExpiresAt: new Date(0)
            })
            await expect(store.beginDispatch(operation.context, operation, authorization)).rejects.toThrow()
            await fixture.db.manager.update(ProjectPipelineInstanceEntity, operation.instanceId, {
                currentRoundId: randomUUID()
            })
            await expect(store.authorize(fixture.context, operation, store.version(operation))).rejects.toThrow()
        })
    })
})
