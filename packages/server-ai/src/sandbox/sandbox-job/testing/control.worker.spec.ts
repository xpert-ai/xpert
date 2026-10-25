import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { TaskControlStore, TaskControlRunner } from '@xpert-ai/server-core'
import { sandboxEvidence, type SandboxRuntimeTarget } from '@xpert-ai/contracts'
import { SandboxJobControlStore } from '../sandbox-job-control.store'
import { SandboxJobControlService } from '../sandbox-job-control.service'
import { SandboxJobCapacityService } from '../sandbox-job-capacity.service'
import { SandboxJobEntity } from '../sandbox-job.entity'
import { sandboxTestEntities } from './postgres-entities'
import { LocalRuntimeControl } from '../local-runtime-control'

const raw = process.env.XPERT_SANDBOX_CONTROL_WORKER
const worker = raw ? it : it.skip
worker(
    'runs the isolated original-host fixture',
    async () => {
        const config = z
            .object({
                url: z.string(),
                schema: z.string().regex(/^sandbox_workers_[a-f0-9]+$/),
                host: z.string().uuid(),
                tenant: z.string().uuid()
            })
            .parse(JSON.parse(raw))
        const db = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url: config.url,
            schema: config.schema,
            extra: { options: `-c search_path=${config.schema}` },
            entities: sandboxTestEntities
        }).initialize()
        const tasks = new TaskControlStore(db),
            runner = new TaskControlRunner(tasks)
        const store = new SandboxJobControlStore(db.getRepository(SandboxJobEntity), tasks)
        const localInstances = new Map<string, { terminate(): void; exitProven: boolean; executionUnknown: boolean }>()
        const local = new LocalRuntimeControl('fixture', localInstances)
        const provider = {
            type: 'fixture',
            version: '1',
            capabilities: { executionControl: 1 },
            prepareControl: (options) => local.prepare(options),
            control: (target: SandboxRuntimeTarget, action: 'inspect' | 'stop') => local.control(target, action),
            destroy: async () => undefined
        }
        const control = new SandboxJobControlService(
            store,
            { get: () => provider } as never,
            runner,
            {} as never,
            tasks
        )
        const capacity = new SandboxJobCapacityService(store.jobs)
        const releases = new Map<string, () => void>()
        const completions = new Map<string, Promise<void>>()
        const children: ReturnType<typeof spawn>[] = []
        let closed = false
        await db.query('INSERT INTO fixture_host(id) VALUES ($1)', [config.host])
        try {
            const until = Date.now() + 90000
            while (!closed && Date.now() < until) {
                const rows = z
                    .array(
                        z.object({
                            id: z.string().uuid(),
                            op: z.enum(['start', 'stop', 'tick', 'release', 'close']),
                            job: z.string().uuid().nullable(),
                            key: z.string().nullable()
                        })
                    )
                    .parse(
                        await db.query(
                            'SELECT id, op, job, key FROM fixture_command WHERE host=$1 AND NOT done ORDER BY sequence LIMIT 1',
                            [config.host]
                        )
                    )
                if (!rows.length) {
                    await new Promise((resolve) => setTimeout(resolve, 20))
                    continue
                }
                const command = rows[0]
                let result: object = {}
                try {
                    if (command.op === 'start') {
                        const input = {
                            action: 'fixture',
                            actionVersion: '1',
                            idempotencyKey: command.key,
                            scope: {
                                tenantId: config.tenant,
                                pluginName: 'fixture',
                                businessResourceType: 'test',
                                businessResourceId: 'one'
                            },
                            payload: {},
                            outputs: []
                        }
                        const seed = store.jobs.create({
                            ...input.scope,
                            action: 'fixture',
                            actionVersion: '1',
                            idempotencyKey: command.key,
                            runtimeProfile: 'fixture',
                            sandboxRuntimeVersion: '1',
                            provider: 'fixture',
                            runtimeBindingId: 'fixture',
                            runtimeArtifactKind: 'filesystem',
                            runtimeArtifactReference: 'fixture',
                            attempt: 1,
                            status: 'waiting',
                            cleanupPending: false,
                            hardDeadlineAt: new Date(Date.now() + 60000)
                        })
                        const reserved = await store.reserve(seed, input, '1', 'attached')
                        result = { job: reserved.job.id, owner: reserved.owner }
                        if (reserved.owner) {
                            await capacity.acquire(reserved.job)
                            const job = await control.prepare(reserved.job, { provider } as never)
                            const process = spawn(global.process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
                                stdio: 'ignore'
                            })
                            children.push(process)
                            const owned = {
                                terminate: () => {
                                    process.kill('SIGTERM')
                                },
                                exitProven: false,
                                executionUnknown: false
                            }
                            localInstances.set(job.control.target.runtimeRef, owned)
                            const exited = new Promise<void>((resolve) =>
                                process.once('exit', () => {
                                    owned.exitProven = true
                                    resolve()
                                })
                            )
                            control.own(job, () => owned.terminate())
                            await db.query("INSERT INTO fixture_effect(kind) VALUES ('execution')")
                            const release = new Promise<void>((resolve) => releases.set(job.id, resolve))
                            const callback = control.callback(job, 'one', async () => {
                                await db.query("INSERT INTO fixture_effect(kind) VALUES ('callback')")
                                await release
                            })
                            const complete = Promise.all([exited, callback]).then(async () => {
                                await control.report(job, 'cancelled')
                                await control.hostExited(job)
                            })
                            completions.set(job.id, complete)
                        }
                    } else if (command.op === 'stop') await control.requestStop(await store.read(command.job))
                    else if (command.op === 'tick') {
                        await control.reconcile()
                        await runner.reconcile()
                    } else if (command.op === 'release') {
                        releases.get(command.job)?.()
                        await completions.get(command.job)
                    } else closed = true
                } catch (error) {
                    result = { error: error instanceof Error ? error.message : 'fixture error' }
                }
                await db.query('UPDATE fixture_command SET done=true, result=$2 WHERE id=$1', [
                    command.id,
                    JSON.stringify(result)
                ])
            }
        } finally {
            for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
            for (const release of releases.values()) release()
            await Promise.allSettled(completions.values())
            runner.onModuleDestroy()
            await db.destroy()
        }
    },
    95000
)
