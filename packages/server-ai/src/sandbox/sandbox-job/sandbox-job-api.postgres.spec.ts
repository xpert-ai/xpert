// Exercises the public run/cancel API with real persistence and file materialization.
// The controllable provider models delayed admission and ignored callback cancellation.
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DataSource } from 'typeorm'
import { sandboxEvidence } from '@xpert-ai/contracts'
import {
    RequestContext,
    type ISandboxRuntimeProvider,
    type SandboxJobRunInput,
    type SandboxRuntimeInstance
} from '@xpert-ai/plugin-sdk'
import { TaskControlRunner, TaskControlStore } from '@xpert-ai/server-core'
import { VolumeHandle } from '../../shared/volume'
import { SandboxJobEntity } from './sandbox-job.entity'
import { SandboxJobRuntimeCapabilityService } from './sandbox-job-runtime-capability.service'
import { SandboxJobControlService } from './sandbox-job-control.service'
import { SandboxJobControlStore } from './sandbox-job-control.store'
import { SandboxJobCapacityService } from './sandbox-job-capacity.service'
import { SandboxRuntimeBindingSelector } from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'
import { sandboxTestEntities } from './testing/postgres-entities'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('Sandbox public API with persistent settlement', () => {
    const schema = `sandbox_api_${randomUUID().replaceAll('-', '')}`
    const tenantId = randomUUID(),
        userId = randomUUID()
    let db: DataSource, root: string, runner: TaskControlRunner
    let control: SandboxJobControlService, remote: SandboxJobControlService, store: SandboxJobControlStore
    let api: SandboxJobRuntimeCapabilityService
    let createGate: ReturnType<typeof deferred<void>>, callbackGate: ReturnType<typeof deferred<void>>
    let entered: ReturnType<typeof deferred<void>>, creating: ReturnType<typeof deferred<void>>
    let withCallback: boolean, exited: boolean, creates: number, executions: number, callbacks: number, cleanups: number
    let outputs: ReturnType<typeof jest.fn>
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
        db = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: sandboxTestEntities
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        await db.query('INSERT INTO tenant(id) VALUES ($1)', [tenantId])
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        root = await mkdtemp(path.join(os.tmpdir(), 'sandbox-api-control-'))
    })
    beforeEach(async () => {
        await db.query('TRUNCATE sandbox_job, execution_task_control, execution_task_publication')
        const tasks = new TaskControlStore(db)
        runner = new TaskControlRunner(tasks)
        store = new SandboxJobControlStore(db.getRepository(SandboxJobEntity), tasks)
        createGate = deferred()
        callbackGate = deferred()
        entered = deferred()
        creating = deferred()
        withCallback = false
        exited = false
        creates = 0
        executions = 0
        callbacks = 0
        cleanups = 0
        const definitions = new SandboxRuntimeDefinitionRegistry()
        const definition = definitions.require('browser/playwright-1.61/v1')
        const instance: SandboxRuntimeInstance = {
            id: 'controlled-runtime',
            workspaceRoot: '/workspace',
            uploadFiles: async (files) => files.map(([name]) => ({ path: name, error: null })),
            downloadFiles: async (names) =>
                names.map((name) => ({ path: name, content: Buffer.from('output'), error: null })),
            execute: async (_command, options) => {
                executions++
                if (withCallback)
                    options.onOutput({
                        stream: 'stdout',
                        text: 'XPERT_SANDBOX_INVOKE {"id":"one","operation":"read","payload":{}}\n'
                    })
                exited = true
                return { output: '', exitCode: 0, timedOut: false, truncated: false }
            },
            terminate: async () => {
                exited = true
            }
        }
        const provider: ISandboxRuntimeProvider = {
            type: 'test',
            version: '1',
            capabilities: {
                executionControl: 1,
                isolation: 'hardened',
                ephemeral: true,
                resourceLimits: true,
                networkPolicy: true,
                readOnlyRootFilesystem: true
            },
            listBindings: () => [
                {
                    id: 'test',
                    provider: 'test',
                    providerVersion: '1',
                    runtimeProfile: definition.name,
                    priority: 0,
                    artifact: { kind: 'oci-image', reference: `test@sha256:${'a'.repeat(64)}` }
                }
            ],
            getBindingHealth: async () => ({ available: true }),
            prepareControl: async (options) => ({
                version: 1,
                kind: 'host',
                provider: 'test',
                runtimeProfile: definition.name,
                generation: options.generation,
                environmentId: store.hostId,
                runtimeRef: options.generation
            }),
            create: async () => {
                creates++
                creating.resolve()
                await createGate.promise
                return instance
            },
            control: async (target, operation) => {
                if (operation === 'stop') exited = true
                return sandboxEvidence(target, exited ? 'exited' : 'running')
            },
            destroy: async () => {
                cleanups++
            }
        }
        const providers = { get: () => provider, list: () => [provider] }
        const volumes = {
            resolve: ({ jobId }) =>
                new VolumeHandle(
                    { tenantId, catalog: 'runtime-jobs', jobId },
                    path.join(root, jobId),
                    path.join(root, jobId),
                    'http://localhost/unused'
                )
        }
        control = new SandboxJobControlService(store, providers as never, runner, volumes as never, tasks)
        remote = new SandboxJobControlService(
            new SandboxJobControlStore(store.jobs, tasks),
            providers as never,
            runner,
            volumes as never,
            tasks
        )
        outputs = jest.fn(async () => ({
            filePath: 'exports/result.txt',
            workspacePath: '/workspace/exports/result.txt',
            catalog: 'users',
            size: 6
        }))
        api = new SandboxJobRuntimeCapabilityService(
            store.jobs,
            definitions,
            {
                get: async () => ({
                    pluginName: 'test',
                    name: 'export',
                    version: '1',
                    runtimeProfile: definition.name,
                    runtimeContractVersion: '1',
                    playwrightVersion: '1.61.0',
                    bundleSha256: 'a'.repeat(64),
                    entrypoint: 'runner.mjs'
                }),
                getCachedBundle: async () => []
            } as never,
            providers as never,
            new SandboxRuntimeBindingSelector(providers as never),
            {} as never,
            { uploadBuffer: outputs } as never,
            new SandboxJobCapacityService(store.jobs),
            volumes as never,
            control,
            store
        )
    })
    afterEach(async () => {
        createGate.resolve()
        callbackGate.resolve()
        runner.onModuleDestroy()
    })
    afterAll(async () => {
        jest.restoreAllMocks()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
        if (root) await rm(root, { recursive: true, force: true })
    })
    function input(): SandboxJobRunInput {
        return {
            action: 'export',
            actionVersion: '1',
            idempotencyKey: randomUUID(),
            scope: { tenantId, userId, pluginName: 'test', businessResourceType: 'test', businessResourceId: 'one' },
            payload: {},
            outputs: [
                {
                    path: 'result.txt',
                    originalName: 'result.txt',
                    mimeType: 'text/plain',
                    destination: { tenantId, userId, catalog: 'users', folder: 'exports' }
                }
            ]
        }
    }
    const invokeOptions = () => ({
        invocation: {
            operations: ['read'],
            maxCalls: 1,
            maxBytes: 1000,
            handle: async () => {
                callbacks++
                entered.resolve()
                await callbackGate.promise
                return { rows: [] }
            }
        }
    })

    it('returns the persisted success to duplicate public calls without another execution or output write', async () => {
        createGate.resolve()
        const data = input()
        const results = await Promise.all([api.run(data), api.run(data)])
        expect(results[0]).toMatchObject({ id: results[1].id, status: 'succeeded', controlState: 'settled' })
        await expect(api.run(data)).resolves.toMatchObject({ id: results[0].id, status: 'succeeded' })
        expect({ creates, executions, outputs: outputs.mock.calls.length }).toEqual({
            creates: 1,
            executions: 1,
            outputs: 1
        })
        expect((await store.read(results[0].id)).capacityHeld).toBe(false)
    })

    it('keeps a cancelled public call pending until the actual ignored callback returns', async () => {
        withCallback = true
        createGate.resolve()
        const data = input()
        const result = api.run(data, invokeOptions()).catch((error: unknown) => error)
        await entered.promise
        const job = await store.jobs.findOneByOrFail({ idempotencyKey: data.idempotencyKey })
        await remote.requestStop(job)
        await control.reconcile()
        expect(await api.getJob({ jobId: job.id })).toMatchObject({ status: 'cancelling', finishedAt: null })
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        expect(cleanups).toBe(0)
        callbackGate.resolve()
        expect(await result).toMatchObject({ code: 'SANDBOX_CANCELLED' })
        const final = await store.read(job.id)
        expect(final).toMatchObject({
            status: 'cancelled',
            capacityHeld: false,
            control: { hostExited: true, phase: 'settled' }
        })
        await expect(api.run(data, invokeOptions())).rejects.toMatchObject({ code: 'SANDBOX_CANCELLED' })
        expect({ creates, executions, callbacks, outputs: outputs.mock.calls.length }).toEqual({
            creates: 1,
            executions: 1,
            callbacks: 1,
            outputs: 0
        })
        console.log(
            'AFTER_PUBLIC_SANDBOX_API',
            JSON.stringify({
                creates,
                executions,
                callbacks,
                heldUntilCallbackReturned: true,
                finalStatus: final.status
            })
        )
    })

    it('stops a delayed create result without executing its Action or reopening the same key', async () => {
        const data = input()
        const result = api.run(data).catch((error: unknown) => error)
        await creating.promise
        const job = await store.jobs.findOneByOrFail({ idempotencyKey: data.idempotencyKey })
        await remote.requestStop(job)
        await control.reconcile()
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        createGate.resolve()
        expect(await result).toMatchObject({ code: 'SANDBOX_CANCELLED' })
        await expect(api.run(data)).rejects.toMatchObject({ code: 'SANDBOX_CANCELLED' })
        expect({ creates, executions }).toEqual({ creates: 1, executions: 0 })
    })
})

function deferred<T>() {
    let resolve: (value?: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
