// Test-only subprocess. Parent owns the disposable database, Redis namespace and cleanup.
import 'reflect-metadata'
import { taskControlTestEntities } from '../../../../server/src/task-control/testing/task-control.fixture'
import { z } from 'zod'
import { DataSource } from 'typeorm'
import { Worker } from 'bullmq'
import { TaskControlStore } from '../../../../server/src/task-control/task-control.store'
import { TaskControlRunner } from '../../../../server/src/task-control/task-control.runner'
import { runControlledJob } from '../../../../server/src/managed-queue/controlled-job'

const config = z
    .object({
        schema: z.string().regex(/^control_worker_[a-f0-9]+$/),
        queue: z.string(),
        mode: z.enum(['hold', 'cooperate']),
        database: z.string().url(),
        redis: z.string().url()
    })
    .parse(JSON.parse(process.argv[2]))
async function main() {
    if (!new URL(config.database).pathname.endsWith('_test') || new URL(config.redis).hostname !== '127.0.0.1')
        throw new Error('Disposable local infrastructure required')
    const database = await new DataSource({
        type: 'postgres',
        uuidExtension: 'pgcrypto',
        url: config.database,
        schema: config.schema,
        extra: { options: `-c search_path=${config.schema}` },
        entities: taskControlTestEntities
    }).initialize()
    const store = new TaskControlStore(database),
        runner = new TaskControlRunner(store)
    const redis = new URL(config.redis)
    const worker = new Worker(
        config.queue,
        async (job) => {
            process.send?.({ type: 'delivery', jobId: job.id })
            return runControlledJob(store, runner, job, 'default', async (control) => {
                await database.query('INSERT INTO phase2_tool_receipt (job, event) VALUES ($1, $2)', [job.id, 'start'])
                process.send?.({ type: 'started', jobId: job.id })
                if (config.mode === 'hold') await new Promise(() => undefined)
                else if (!control.signal.aborted)
                    await new Promise<void>((done) =>
                        control.signal.addEventListener('abort', () => done(), { once: true })
                    )
                await database.query('INSERT INTO phase2_tool_receipt (job, event) VALUES ($1, $2)', [job.id, 'exit'])
            })
        },
        {
            connection: { host: redis.hostname, port: Number(redis.port) },
            lockDuration: 1000,
            stalledInterval: 500,
            maxStalledCount: 3
        }
    )
    worker.on('error', (error) => process.send?.({ type: 'worker-error', message: error.message }))
    worker.on('completed', (job) => process.send?.({ type: 'completed', jobId: job.id }))
    await worker.waitUntilReady()
    process.send?.({ type: 'ready' })
    process.on('message', async (message) => {
        if (message !== 'close') return
        await worker.close(true)
        runner.onModuleDestroy()
        await database.destroy()
        process.exit(0)
    })
}
main().catch((error) => {
    process.send?.({ type: 'error', message: error.message })
    process.exit(1)
})
