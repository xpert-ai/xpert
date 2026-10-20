import * as hostProfile from '../configuration/pipeline-host-profile'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, Table } from 'typeorm'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { coreEntities } from '../../../../../server/src/core/entities'
import { ALL_AI_ENTITIES } from '../../../core/entities'
import {
    projectPipelineProjectionSchema,
    XpertAgentExecutionStatusEnum,
    type ProjectPipelineProviderActionCommand,
    type ProjectPipelineProjection
} from '@xpert-ai/contracts'
import {
    ProjectPipelineProjectionProviderRegistry,
    getTenantGlobalScopeKey,
    RequestContext,
    type ProjectPipelineContext,
    type IProjectPipelineProjectionProvider
} from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import {
    ProjectPipelineEntities,
    ProjectPipelineProviderActionEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRoundEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineProjectionStore } from '../projection/pipeline-projection.store'
import { ProjectPipelineProviderActionStore } from './provider-action.store'
import { ProjectPipelineProviderActionsService } from './provider-actions.service'
import { providerActionQueueFixture } from './testing/provider-action-queue.fixture'
import { untilPipeline } from '../projection/testing/pipeline-queue.fixture'
import { providerActionAttentions } from '../queries/pipeline-provider-attentions'
import { ProjectPipelineQueryService } from '../queries/pipeline-query.service'
import { readPipelineQueueStatistics } from '../queries/pipeline-queue-statistics'
import {
    AuthorizePipelineNativeExecutionHandler,
    ProjectPipelineNativeGrantStore
} from '../runtime/pipeline-native-grant.handler'
import { AuthorizePipelineNativeExecutionCommand } from '../runtime/pipeline-native-grant.command'
import { ProjectPipelineNativeGrantEntity } from '../persistence/pipeline.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { ProjectPipelineEventEntity } from '../persistence/pipeline.entity'

const url = process.env.XPERT_PIPELINE_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite.each(['empty', 'orm-precreated'])('Provider action PostgreSQL outbox (%s)', (layout) => {
    const schema = `provider_action_${randomUUID().replace(/-/g, '')}`
    let db: DataSource,
        context: ProjectPipelineContext,
        store: ProjectPipelineProviderActionStore,
        service: ProjectPipelineProviderActionsService
    let input: ProjectPipelineProviderActionCommand, instanceId: string
    let sourceSnapshot: ProjectPipelineProjection
    const actions = jest.fn(),
        executeAction = jest.fn(),
        inspectAction = jest.fn(),
        assertEdit = jest.fn(),
        synchronize = jest.fn()
    const descriptor = {
        ref: 'neutral.inspect@1',
        label: { en_US: 'Inspect document' },
        sourceRevision: '1',
        effects: 'domain_write' as const,
        idempotency: 'keyed_receipt' as const,
        parameters: [],
        defaults: {}
    }
    const provider: IProjectPipelineProjectionProvider = {
        key: 'neutral.provider@1',
        snapshot: async () => null,
        actions,
        executeAction,
        inspectAction
    }
    const rows = () => db.getRepository(ProjectPipelineProviderActionEntity)
    const load = (id: string) => rows().findOneByOrFail({ id })
    const due = (id: string) => rows().update(id, { nextCheckAt: new Date(0), leaseExpiresAt: null })
    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_pipeline_test_'))
            throw new Error('Dedicated pipeline test database required')
        db = new DataSource({
            type: 'postgres',
            url,
            schema,
            entities: [...coreEntities, ...ALL_AI_ENTITIES],
            extra: { options: `-c search_path=${schema},public` }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        const runner = db.createQueryRunner()
        for (const entity of [
            XpertProject,
            XpertProjectMembership,
            XpertProjectTask,
            XpertProjectTaskExecution,
            XpertAgentExecution,
            ...(layout === 'orm-precreated' ? ProjectPipelineEntities : [])
        ])
            await runner.createTable(Table.create(db.getMetadata(entity), db.driver))
        await runner.release()
        for (const name of [
            '20261018-project-pipeline.sql',
            '20261018-project-pipeline-runtime.sql',
            '20261019-project-pipeline-resources.sql',
            '20261019-project-pipeline-runtime-intent.sql',
            '20261019-project-pipeline-provider-actions.sql',
            '20261019-project-pipeline-model-budget.sql',
            '20261019-project-pipeline-native-grant.sql'
        ]) {
            const migration = readFileSync(join(__dirname, '../migrations', name), 'utf8')
            await db.query(migration)
            await db.query(migration)
        }
    }, 30_000)
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    const dispatchSetting = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
    afterEach(() => {
        if (dispatchSetting === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = dispatchSetting
    })
    beforeEach(async () => {
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        for (const mock of [actions, executeAction, inspectAction, assertEdit, synchronize]) mock.mockReset()
        context = {
            projectId: randomUUID(),
            actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        }
        await db
            .getRepository(XpertProject)
            .save({ id: context.projectId, name: 'Neutral provider acceptance', ...context.actor })
        const snapshot = projectPipelineProjectionSchema.parse({
            schemaVersion: 1,
            sourceKey: 'document-a',
            sourceEpoch: randomUUID(),
            sourceSequence: 1,
            title: 'Document validation',
            definition: {
                key: 'neutral.document',
                version: '1.0.0',
                title: 'Document validation',
                executionAuthority: 'provider',
                providerRef: provider.key,
                subjectResolverRef: 'neutral.subject@1',
                topology: { source: 'provider', presentationAdapterRef: 'neutral.presentation@1' },
                roles: [{ key: 'worker', allowedKinds: ['service'] }],
                lanes: [{ key: 'work', roleKey: 'worker', label: 'Work', order: 0 }],
                stages: [{ key: 'check', label: 'Check', order: 0 }],
                actionRefs: [descriptor.ref]
            },
            subject: { resolverRef: 'neutral.subject@1', objectKey: 'document-a' },
            run: { key: 'run-1', state: 'active' },
            round: {
                key: 'round-1',
                sequence: 1,
                generation: 1,
                state: 'active',
                inputDigest: 'a'.repeat(64),
                subjectVersionSet: [
                    { resolverRef: 'neutral.subject@1', objectKey: 'document-a', version: '1', digest: 'a'.repeat(64) }
                ]
            },
            nodes: [
                {
                    key: 'check',
                    nodeKey: 'check',
                    expansionKey: 'root',
                    title: 'Check document',
                    kind: 'work',
                    laneKey: 'work',
                    stageKey: 'check',
                    taskKeys: ['check'],
                    evidence: [],
                    state: {
                        lifecycle: 'active',
                        readiness: 'ready',
                        applicability: 'selected',
                        freshness: 'current',
                        runtime: 'none'
                    }
                }
            ],
            edges: [],
            tasks: [
                {
                    key: 'check',
                    title: 'Check document',
                    kind: 'task',
                    status: 'todo',
                    predecessorKeys: [],
                    executions: []
                }
            ],
            taskTombstones: [],
            nodeTombstones: []
        })
        const links = await new ProjectPipelineProjectionStore(db.getRepository(XpertProject)).apply(
            context,
            provider,
            snapshot
        )
        sourceSnapshot = snapshot
        instanceId = links.instanceId
        const node = await db.getRepository(ProjectPipelineNodeEntity).findOneByOrFail({ projectId: context.projectId })
        const registry = new ProjectPipelineProjectionProviderRegistry({} as DiscoveryService, new Reflector())
        registry.register(provider.key, provider, {
            kind: 'plugin',
            pluginName: 'neutral',
            scopeKey: getTenantGlobalScopeKey(context.actor.tenantId)
        })
        store = new ProjectPipelineProviderActionStore(rows())
        const access = { assertEdit, listReadable: async () => [{ role: 'owner', archived: false }] }
        service = new ProjectPipelineProviderActionsService(store, access as never, registry, { synchronize } as never)
        actions.mockResolvedValue([descriptor])
        executeAction.mockResolvedValue({ status: 'succeeded', receiptKey: 'receipt-1' })
        inspectAction.mockResolvedValue({ status: 'succeeded', receiptKey: 'receipt-1' })
        synchronize.mockResolvedValue(links)
        input = {
            ...(await service.list(context, { instanceId, nodeInstanceId: node.id })).target,
            requestId: randomUUID(),
            actionRef: descriptor.ref,
            sourceRevision: '1',
            parameters: {}
        }
    })
    async function nativeGrant() {
        const submitted = await service.submit(context, input),
            worker = randomUUID()
        const claim = await store.claim(context, submitted.id, worker)
        expect(claim?.mode).toBe('execute')
        expect(await store.begin(context, submitted.id, worker, claim!.fence)).toBe(true)
        const target = {
            id: randomUUID(),
            workspaceId: randomUUID(),
            version: '1',
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId
        }
        const canUse = jest.fn(),
            published = jest.fn(async () => target)
        const grants = new ProjectPipelineNativeGrantStore(
            db,
            store,
            { assertCanUseXpert: canUse } as never,
            { getAccessiblePublishedXpert: published } as never,
            { assertEdit } as never
        )
        const handler = new AuthorizePipelineNativeExecutionHandler(grants)
        const request = {
            ...context,
            source: {
                kind: 'provider_action' as const,
                operationId: submitted.id,
                leaseOwner: worker,
                leaseFence: claim!.fence,
                callKey: 'primary'
            },
            executionId: randomUUID(),
            conversationId: randomUUID(),
            xpertId: target.id,
            workspaceId: target.workspaceId,
            publishedVersion: target.version,
            inputDigest: 'a'.repeat(64)
        }
        return { request, handler, grants, target, canUse, published }
    }
    it('pins one immutable native identity per provider call and does not mint another after lease settlement', async () => {
        const f = await nativeGrant(),
            call = () => f.handler.execute(new AuthorizePipelineNativeExecutionCommand(f.request))
        await f.grants.prepare(f.request)
        await f.grants.prepare(f.request)
        await call()
        const grants = db.getRepository(ProjectPipelineNativeGrantEntity)
        expect(await grants.countBy({ projectId: context.projectId })).toBe(1)
        expect(await grants.findOneByOrFail({ executionId: f.request.executionId })).toMatchObject({
            providerActionId: f.request.source.operationId,
            instanceId,
            createdById: context.actor.userId,
            xpertId: f.target.id
        })
        await expect(
            f.handler.execute(new AuthorizePipelineNativeExecutionCommand({ ...f.request, executionId: randomUUID() }))
        ).rejects.toMatchObject({ response: { code: 'NATIVE_GRANT_IDENTITY_IMMUTABLE' } })
        expect(f.canUse).toHaveBeenCalledWith(context.projectId, f.target.id, context.actor)
        await rows().update(f.request.source.operationId, {
            state: 'succeeded',
            leaseOwner: null,
            leaseExpiresAt: null
        })
        await expect(call()).rejects.toMatchObject({ response: { code: 'NATIVE_DISPATCH_ALREADY_CONSUMED' } })
        expect(await grants.countBy({ projectId: context.projectId })).toBe(1)
    })
    it('keeps a recovered inspection lease from minting new native grants while preserving the prepared identity', async () => {
        const f = await nativeGrant(),
            id = f.request.source.operationId,
            observer = randomUUID()
        await f.grants.prepare(f.request)
        await due(id)
        const recovered = await store.claim(context, id, observer)
        expect(recovered.mode).toBe('inspect')
        await expect(
            f.grants.prepare({
                ...f.request,
                executionId: randomUUID(),
                source: {
                    ...f.request.source,
                    leaseOwner: observer,
                    leaseFence: recovered.fence,
                    callKey: 'new-effect'
                }
            })
        ).rejects.toMatchObject({ response: { code: 'OPERATION_DISPATCH_NOT_AUTHORIZED' } })
        await f.grants.consume(f.request)
        await expect(f.grants.consume(f.request)).rejects.toMatchObject({
            response: { code: 'NATIVE_DISPATCH_ALREADY_CONSUMED' }
        })
        expect(await db.getRepository(ProjectPipelineNativeGrantEntity).countBy({ projectId: context.projectId })).toBe(
            1
        )
    })
    it('does not allow first dispatch through a recovered inspection lease', async () => {
        const submitted = await service.submit(context, input),
            observer = randomUUID()
        await store.claim(context, submitted.id, randomUUID())
        await due(submitted.id)
        const recovered = await store.claim(context, submitted.id, observer)
        expect(recovered.mode).toBe('inspect')
        expect(await store.begin(context, submitted.id, observer, recovered.fence)).toBe(false)
    })
    it('rejects wrong project, actor, lease and publication before saving a native identity', async () => {
        const f = await nativeGrant(),
            r = f.request
        for (const request of [
            { ...r, projectId: randomUUID() },
            { ...r, actor: { ...r.actor, userId: randomUUID() } },
            { ...r, source: { ...r.source, leaseFence: r.source.leaseFence + 1 } },
            { ...r, source: { ...r.source, leaseOwner: randomUUID() } },
            { ...r, publishedVersion: 'changed' },
            { ...r, workspaceId: randomUUID() }
        ])
            await expect(f.handler.execute(new AuthorizePipelineNativeExecutionCommand(request))).rejects.toThrow()
        await rows().update(r.source.operationId, { leaseExpiresAt: new Date(0) })
        await expect(f.handler.execute(new AuthorizePipelineNativeExecutionCommand(r))).rejects.toThrow()
        expect(await db.getRepository(ProjectPipelineNativeGrantEntity).countBy({ projectId: context.projectId })).toBe(
            0
        )
    })
    it('permits an exact prepared task after lease expiry once, without permitting a new call or payload replacement', async () => {
        const f = await nativeGrant()
        await f.grants.prepare(f.request)
        await rows().update(f.request.source.operationId, { state: 'unknown', leaseOwner: null, leaseExpiresAt: null })
        for (const request of [
            { ...f.request, inputDigest: 'b'.repeat(64) },
            { ...f.request, source: { ...f.request.source, leaseFence: f.request.source.leaseFence + 1 } },
            { ...f.request, source: { ...f.request.source, callKey: 'another' }, executionId: randomUUID() }
        ])
            await expect(f.grants.consume(request)).rejects.toThrow()
        await f.grants.consume(f.request)
        await expect(f.grants.consume(f.request)).rejects.toMatchObject({
            response: { code: 'NATIVE_DISPATCH_ALREADY_CONSUMED' }
        })
        expect(
            await db
                .getRepository(ProjectPipelineNativeGrantEntity)
                .findOneByOrFail({ executionId: f.request.executionId })
        ).toMatchObject({ consumedAt: expect.any(Date), inputDigest: f.request.inputDigest })
    })
    it('rechecks current work and permission for a prepared task before native dispatch', async () => {
        const f = await nativeGrant()
        await f.grants.prepare(f.request)
        assertEdit.mockRejectedValueOnce(new Error('revoked'))
        await expect(f.grants.consume(f.request)).rejects.toThrow('revoked')
        await db.getRepository(ProjectPipelineNodeEntity).update(input.nodeInstanceId, { disposition: 'superseded' })
        await expect(f.grants.consume(f.request)).rejects.toThrow()
        expect(
            (
                await db
                    .getRepository(ProjectPipelineNativeGrantEntity)
                    .findOneByOrFail({ executionId: f.request.executionId })
            ).consumedAt
        ).toBeNull()
    })
    it('serializes competing consumers of a prepared task', async () => {
        const f = await nativeGrant()
        await f.grants.prepare(f.request)
        const competing = await Promise.allSettled([f.grants.consume(f.request), f.grants.consume(f.request)])
        expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1)
        expect(await db.getRepository(ProjectPipelineNativeGrantEntity).countBy({ projectId: context.projectId })).toBe(
            1
        )
    })
    it('blocks prepared effects during drain and never revives a deleted grant', async () => {
        const f = await nativeGrant(),
            grants = db.getRepository(ProjectPipelineNativeGrantEntity)
        await f.grants.prepare(f.request)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        await expect(f.grants.consume(f.request)).rejects.toMatchObject({
            response: { code: 'PIPELINE_DISPATCH_PAUSED' }
        })
        expect((await grants.findOneByOrFail({ executionId: f.request.executionId })).consumedAt).toBeNull()
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        await grants.softDelete({ executionId: f.request.executionId })
        await expect(f.grants.consume(f.request)).rejects.toMatchObject({
            response: { code: 'NATIVE_DISPATCH_GRANT_CLOSED' }
        })
        await expect(f.grants.prepare(f.request)).rejects.toThrow()
        expect(await grants.count({ withDeleted: true, where: { projectId: context.projectId } })).toBe(1)
    })
    it('refuses reused native execution identities and current permission revocation', async () => {
        const f = await nativeGrant()
        await db.getRepository(XpertAgentExecution).save({
            id: f.request.executionId,
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId
        })
        await expect(f.handler.execute(new AuthorizePipelineNativeExecutionCommand(f.request))).rejects.toMatchObject({
            response: { code: 'NATIVE_EXECUTION_ALREADY_EXISTS' }
        })
        assertEdit.mockRejectedValueOnce(new Error('revoked'))
        await expect(
            f.handler.execute(new AuthorizePipelineNativeExecutionCommand({ ...f.request, executionId: randomUUID() }))
        ).rejects.toThrow('revoked')
        expect(await db.getRepository(ProjectPipelineNativeGrantEntity).countBy({ projectId: context.projectId })).toBe(
            0
        )
    })
    it('passes native dispatch provenance only to execute, never to list or recovery inspection', async () => {
        const view = await service.submit(context, input)
        executeAction.mockResolvedValueOnce({ status: 'unknown', receiptKey: 'native' })
        await service.run(context, view.id)
        const sent = executeAction.mock.calls[0][0],
            row = await load(view.id)
        expect(sent.nativeDispatch).toEqual({
            kind: 'provider_action',
            operationId: row.id,
            leaseOwner: expect.any(String),
            leaseFence: row.leaseFence
        })
        expect(actions.mock.calls.every(([context]) => context.nativeDispatch === undefined)).toBe(true)
        inspectAction.mockResolvedValueOnce({ status: 'succeeded', receiptKey: 'native' })
        await due(row.id)
        await service.run(context, row.id)
        await due(row.id)
        await service.run(context, row.id)
        expect(inspectAction.mock.calls[0][0]).not.toHaveProperty('nativeDispatch')
        expect(executeAction).toHaveBeenCalledTimes(1)
    })
    it('counts provider dispatch once and does not fabricate a wait for an unconfirmed first claim', async () => {
        const view = await service.submit(context, input),
            row = await load(view.id)
        const from = new Date(row.createdAt.getTime() - 1).toISOString(),
            to = new Date(row.createdAt.getTime() + 60000).toISOString()
        const read = () => readPipelineQueueStatistics(db.manager, context, [instanceId], { from, to }, to)
        expect((await read()).total).toMatchObject({ total: 1, queued: 1 })
        await service.run(context, row.id)
        const data = await read()
        expect(data.total).toMatchObject({ total: 1, dispatched: 1, queued: 0, unavailable: 0 })
        expect(data.bySource[1].metrics.total).toBe(1)
        await due(row.id)
        await service.run(context, row.id)
        expect((await read()).total.dispatchWait).toEqual(data.total.dispatchWait)
        const second = await service.submit(context, { ...input, requestId: randomUUID() })
        await store.claim(context, second.id, randomUUID(), 100)
        await due(second.id)
        await service.run(context, second.id)
        expect((await read()).total).toMatchObject({ total: 2, dispatched: 1, queued: 0, unavailable: 1 })
    })
    it('defers incompatible provider workers without consuming execute or replaying unknown writes', async () => {
        const row = await service.submit(context, input),
            profile = hostProfile.pipelineHostCapabilities()
        const host = jest
            .spyOn(hostProfile, 'pipelineHostCapabilities')
            .mockReturnValue({ protocols: [], features: {} })
        try {
            await service.run(context, row.id)
            expect(executeAction).not.toHaveBeenCalled()
            expect(await load(row.id)).toMatchObject({ state: 'queued', leaseFence: 0, dispatchStartedAt: null })
            expect((await store.due()).some((item) => item.id === row.id)).toBe(false)
            host.mockReturnValue(profile)
            await due(row.id)
            executeAction.mockResolvedValueOnce({ status: 'unknown', receiptKey: 'original' })
            inspectAction.mockResolvedValue({ status: 'succeeded', receiptKey: 'original' })
            await service.run(context, row.id)
            const original = await load(row.id)
            expect(executeAction).toHaveBeenCalledTimes(1)
            host.mockReturnValue({ protocols: [], features: {} })
            await due(row.id)
            await service.run(context, row.id)
            expect(inspectAction).not.toHaveBeenCalled()
            expect(await load(row.id)).toMatchObject({
                state: 'unknown',
                dispatchStartedAt: original.dispatchStartedAt,
                receipt: original.receipt
            })
            host.mockReturnValue(profile)
            await due(row.id)
            await service.run(context, row.id)
            // First recover the pending projection, then inspect the original receipt.
            await due(row.id)
            await service.run(context, row.id)
            expect(inspectAction).toHaveBeenCalledTimes(1)
            expect(executeAction).toHaveBeenCalledTimes(1)
        } finally {
            host.mockRestore()
        }
    })
    it('pauses new commands and queued delivery while preserving idempotent receipts', async () => {
        const row = await service.submit(context, input)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        const view = await service.list(context, { instanceId: input.instanceId, nodeInstanceId: input.nodeInstanceId })
        expect(view).toMatchObject({ dispatchEnabled: false, items: [], operations: [{ id: row.id, state: 'queued' }] })
        expect(await service.submit(context, input)).toMatchObject({ id: row.id })
        await expect(service.submit(context, { ...input, requestId: randomUUID() })).rejects.toMatchObject({
            response: { code: 'PIPELINE_DISPATCH_PAUSED' },
            status: 503
        })
        await expect(store.reserve(context, { ...input, requestId: randomUUID() })).rejects.toMatchObject({
            response: { code: 'PIPELINE_DISPATCH_PAUSED' }
        })
        await service.run(context, row.id)
        expect(await load(row.id)).toMatchObject({ state: 'queued', leaseFence: 0, dispatchStartedAt: null })
        expect((await store.due()).some((item) => item.id === row.id)).toBe(false)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'true'
        await service.run(context, row.id)
        expect(executeAction).toHaveBeenCalledTimes(1)
    })
    it('continues inspect and projection after pausing and fences a claimed execute', async () => {
        const row = await service.submit(context, input),
            worker = randomUUID()
        const claim = await store.claim(context, row.id, worker)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        expect(await store.begin(context, row.id, worker, claim.fence)).toBe(false)
        await due(row.id)
        expect((await store.due()).some((item) => item.id === row.id)).toBe(true)
        await service.run(context, row.id)
        expect(inspectAction).toHaveBeenCalledTimes(1)
        expect(executeAction).not.toHaveBeenCalled()
        expect(await load(row.id)).toMatchObject({ state: 'succeeded', projectionPending: true })
        await due(row.id)
        await service.run(context, row.id)
        expect(await load(row.id)).toMatchObject({ state: 'succeeded', projectionPending: false })
        expect(synchronize).toHaveBeenCalledTimes(1)
    })
    it('serializes duplicate intents and blocks a second unresolved command for the node', async () => {
        const [a, b] = await Promise.all([service.submit(context, input), service.submit(context, input)])
        expect(a.id).toBe(b.id)
        expect(a.state).toBe('queued')
        await expect(service.submit(context, { ...input, requestId: randomUUID() })).rejects.toMatchObject({
            response: { code: 'PROVIDER_ACTION_CONFIRMATION_PENDING' }
        })
        await expect(service.submit(context, { ...input, sourceRevision: 'changed' })).rejects.toMatchObject({
            response: { code: 'PROVIDER_ACTION_REQUEST_CONFLICT' }
        })
        expect(executeAction).not.toHaveBeenCalled()
    })
    it('persists receipt before refreshing and retries only projection after a refresh failure', async () => {
        const row = await service.submit(context, input)
        await service.run(context, row.id)
        expect(await load(row.id)).toMatchObject({ state: 'succeeded', projectionPending: true })
        synchronize.mockRejectedValueOnce(new Error('projection unavailable'))
        await due(row.id)
        await expect(service.run(context, row.id)).rejects.toThrow('projection unavailable')
        await due(row.id)
        await service.run(context, row.id)
        expect(await load(row.id)).toMatchObject({ state: 'succeeded', projectionPending: false })
        expect(executeAction).toHaveBeenCalledTimes(1)
        expect(inspectAction).not.toHaveBeenCalled()
    })
    it('inspects after a lost first claim and fences stale workers', async () => {
        const row = await service.submit(context, input),
            firstWorker = randomUUID()
        const claim = await store.claim(context, row.id, firstWorker, 100)
        expect(claim.mode).toBe('execute')
        await due(row.id)
        await service.run(context, row.id)
        expect(executeAction).not.toHaveBeenCalled()
        expect(inspectAction).toHaveBeenCalledTimes(1)
        expect(await store.settle(context, row.id, firstWorker, claim.fence, { status: 'failed' })).toBe(false)
        expect((await load(row.id)).state).toBe('succeeded')
    })
    it('does not resend a lost dispatch response during recovery', async () => {
        executeAction.mockRejectedValueOnce(new Error('response lost'))
        const row = await service.submit(context, input)
        await service.run(context, row.id)
        expect((await load(row.id)).state).toBe('unknown')
        // First recover the pending projection, then inspect the exact operation.
        await due(row.id)
        await service.run(context, row.id)
        await due(row.id)
        await service.run(context, row.id)
        expect(executeAction).toHaveBeenCalledTimes(1)
        expect(inspectAction).toHaveBeenCalledTimes(1)
        expect(inspectAction.mock.calls[0][0].operationId).toBe(row.id)
    })
    it('projects unknown operations as scoped, read-only attention and changes the graph cursor after recovery', async () => {
        const query = new ProjectPipelineQueryService(
            db.getRepository(ProjectPipelineInstanceEntity),
            { listReadable: async () => [{ role: 'owner', archived: false, canManage: true }] } as never,
            {
                graphWithinTransaction: async () => ({
                    projectId: context.projectId,
                    cursor: 'unchanged-tasks',
                    tasks: [],
                    executions: [],
                    diagnostics: []
                })
            } as never,
            { synchronize } as never,
            { listForActor: () => [] } as never
        )
        const before = await query.graph(context, instanceId)
        executeAction.mockRejectedValueOnce(new Error('response lost'))
        const row = await service.submit(context, input)
        await service.run(context, row.id)
        const attention = await providerActionAttentions(db.manager, context, instanceId, input.roundId)
        expect(attention).toMatchObject([
            {
                id: row.id,
                source: 'provider_action',
                kind: 'unknown',
                state: 'open',
                nodeInstanceId: input.nodeInstanceId,
                inputDigest: input.inputDigest,
                outcomes: [],
                inputEvidence: []
            }
        ])
        for (const scope of [
            { ...context, projectId: randomUUID() },
            { ...context, actor: { ...context.actor, tenantId: randomUUID() } },
            { ...context, actor: { ...context.actor, organizationId: randomUUID() } }
        ])
            expect(await providerActionAttentions(db.manager, scope, instanceId, input.roundId)).toEqual([])
        expect(await providerActionAttentions(db.manager, context, instanceId, randomUUID())).toEqual([])
        const unknown = await query.graph(context, instanceId)
        expect(unknown.attentions).toEqual(attention)
        expect(unknown.cursor).not.toBe(before.cursor)
        expect(inspectAction).not.toHaveBeenCalled()
        await due(row.id)
        await service.run(context, row.id)
        await due(row.id)
        await service.run(context, row.id)
        const resolved = await query.graph(context, instanceId)
        expect(resolved.attentions).toEqual([])
        expect(resolved.cursor).not.toBe(unknown.cursor)
        expect(executeAction).toHaveBeenCalledTimes(1)
        expect(inspectAction).toHaveBeenCalledTimes(1)
    })
    it('rejects stale input before reservation and supersedes a queued intent after version change', async () => {
        await expect(service.submit(context, { ...input, generation: 2 })).rejects.toMatchObject({
            response: { code: 'PROVIDER_ACTION_VERSION_CONFLICT' }
        })
        const row = await service.submit(context, input)
        await db.getRepository(ProjectPipelineInstanceEntity).increment({ id: instanceId }, 'revision', 1)
        await service.run(context, row.id)
        expect((await load(row.id)).state).toBe('superseded')
        expect(executeAction).not.toHaveBeenCalled()
    })
    it('rechecks current authorization and retains the original actor on recovery', async () => {
        const row = await service.submit(context, input)
        assertEdit.mockRejectedValueOnce(new Error('Project access revoked'))
        await expect(service.run(context, row.id)).rejects.toThrow('Project access revoked')
        expect((await load(row.id)).state).toBe('queued')
        expect(executeAction).not.toHaveBeenCalled()
        await expect(
            service.run({ ...context, actor: { ...context.actor, userId: randomUUID() } }, row.id)
        ).rejects.toMatchObject({ response: { code: 'PROVIDER_ACTION_ACTOR_MISMATCH' } })
        await expect(
            service.run({ ...context, actor: { ...context.actor, organizationId: randomUUID() } }, row.id)
        ).rejects.toThrow()
    })
    it('revalidates the provider revision and blocks undeclared action refs and parameters', async () => {
        await expect(service.submit(context, { ...input, actionRef: 'neutral.other@1' })).rejects.toMatchObject({
            response: { code: 'PROVIDER_ACTION_NOT_ALLOWED' }
        })
        await expect(service.submit(context, { ...input, parameters: { role: 'owner' } })).rejects.toMatchObject({
            response: { code: 'PROVIDER_ACTION_PARAMETERS_INVALID' }
        })
        const row = await service.submit(context, input)
        actions.mockResolvedValue([{ ...descriptor, sourceRevision: '2' }])
        await service.run(context, row.id)
        expect(await load(row.id)).toMatchObject({
            state: 'failed',
            reasonCode: 'PROVIDER_ACTION_NOT_ALLOWED',
            dispatchStartedAt: null
        })
        expect(executeAction).not.toHaveBeenCalled()
    })
    it('enforces cross-project ownership in database foreign keys', async () => {
        const row = await service.submit(context, input),
            otherProject = randomUUID()
        await db.getRepository(XpertProject).save({ id: otherProject, name: 'Other neutral project', ...context.actor })
        await expect(rows().update(row.id, { projectId: otherProject })).rejects.toThrow()
    })
    const queueTest = process.env.XPERT_PIPELINE_TEST_REDIS_URL ? it : it.skip
    queueTest(
        'restores original scope through ManagedQueue and reconciles a lost response after worker replacement',
        async () => {
            const captured: string[] = []
            executeAction.mockImplementation(async () => {
                captured.push(
                    RequestContext.currentTenantId(),
                    RequestContext.getOrganizationId(),
                    RequestContext.currentUserId()
                )
                throw new Error('accepted effect, response lost')
            })
            const row = await service.submit(context, input)
            const queue = providerActionQueueFixture(store, service, process.env.XPERT_PIPELINE_TEST_REDIS_URL)
            try {
                await queue.recover() // Delivery remains durable while no worker exists.
                const first = queue.startWorker()
                await untilPipeline(async () => (await load(row.id)).state === 'unknown')
                await first.close()
                expect(captured).toEqual([context.actor.tenantId, context.actor.organizationId, context.actor.userId])
                process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
                queue.startWorker()
                await due(row.id)
                await queue.recover()
                await untilPipeline(async () => !(await load(row.id)).projectionPending)
                await due(row.id)
                await queue.recover()
                await untilPipeline(async () => (await load(row.id)).state === 'succeeded')
                expect(executeAction).toHaveBeenCalledTimes(1)
                expect(inspectAction).toHaveBeenCalledTimes(1)
                expect(inspectAction.mock.calls[0][0]).toMatchObject({ operationId: row.id, actor: context.actor })
            } finally {
                await queue.close()
            }
        },
        30_000
    )
})
