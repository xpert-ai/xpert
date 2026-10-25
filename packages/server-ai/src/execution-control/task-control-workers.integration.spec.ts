import {
    taskControlTestEntities,
    seedTaskControlScope
} from '../../../server/src/task-control/testing/task-control.fixture'
import { fork, ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { Queue } from 'bullmq'
import { TaskControlStore } from '../../../server/src/task-control/task-control.store'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
    redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
const integration = url && redisUrl ? describe : describe.skip
integration('phase 2 independent queue worker processes', () => {
    const schema = `control_worker_${randomUUID().replace(/-/g, '')}`,
        queueName = `control-v2-${randomUUID()}`
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    let database: DataSource, queue: Queue, store: TaskControlStore
    const children: ChildProcess[] = []
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test') || new URL(redisUrl).hostname !== '127.0.0.1')
            throw new Error('Disposable local infrastructure required')
        database = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: taskControlTestEntities
        }).initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        await seedTaskControlScope(database, scope)
        await database.query('CREATE TABLE phase2_tool_receipt (job varchar NOT NULL, event varchar NOT NULL)')
        const redis = new URL(redisUrl)
        queue = new Queue(queueName, { connection: { host: redis.hostname, port: Number(redis.port) } })
        store = new TaskControlStore(database)
    })
    afterAll(async () => {
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        if (queue) {
            await queue.obliterate({ force: true })
            await queue.close()
        }
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    function worker(mode: 'hold' | 'cooperate') {
        const child = fork(
            resolve(__dirname, 'testing/control-phase2.worker.ts'),
            [JSON.stringify({ schema, queue: queueName, mode, database: url, redis: redisUrl })],
            {
                execArgv: [
                    '-r',
                    require.resolve('ts-node/register/transpile-only'),
                    '-r',
                    require.resolve('tsconfig-paths/register')
                ],
                env: {
                    ...process.env,
                    TS_NODE_PROJECT: resolve(__dirname, '../../tsconfig.spec.json'),
                    TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' })
                },
                silent: true
            }
        )
        children.push(child)
        let stderr = ''
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })
        const messages: Array<{ type: string; jobId?: string; message?: string }> = []
        child.on('message', (message) => {
            if (typeof message === 'object' && message && 'type' in message && typeof message.type === 'string')
                messages.push(message as { type: string; jobId?: string; message?: string })
        })
        return {
            child,
            async until(type: string, jobId?: string) {
                const deadline = Date.now() + 15000
                while (Date.now() < deadline) {
                    const error = messages.find((message) => message.type === 'error')
                    if (error || child.exitCode !== null || child.signalCode !== null)
                        throw new Error(error?.message ?? stderr)
                    if (messages.some((message) => message.type === type && (!jobId || message.jobId === jobId))) return
                    await new Promise((done) => setTimeout(done, 30))
                }
                throw new Error(`Worker did not report ${type}: ${stderr}`)
            }
        }
    }
    async function target() {
        const parent = await store.register({
            ...scope,
            kind: 'execution',
            resourceId: randomUUID(),
            executionId: randomUUID()
        })
        const jobId = randomUUID()
        const task = await store.register({
            ...scope,
            kind: 'managed-queue',
            resourceId: `default/${jobId}`,
            parent: { version: 2, targetId: parent.id }
        })
        const enqueue = () =>
            queue.add(
                'tool',
                { ...scope, control: { version: 2, targetId: task.id } },
                { jobId, removeOnComplete: false, removeOnFail: false }
            )
        return { parent, task, jobId, enqueue }
    }
    it('keeps a claimed job unknown after SIGKILL and forbids a second process from replaying its tool', async () => {
        const task = await target(),
            first = worker('hold')
        await first.until('ready')
        await task.enqueue()
        await first.until('started', task.jobId)
        const exited = new Promise((done) => first.child.once('exit', done))
        first.child.kill('SIGKILL')
        await exited
        const second = worker('cooperate')
        await second.until('ready')
        await second.until('delivery', task.jobId)
        await new Promise((done) => setTimeout(done, 200))
        expect(await database.query('SELECT event FROM phase2_tool_receipt WHERE job=$1', [task.jobId])).toEqual([
            { event: 'start' }
        ])
        expect((await store.read(task.task.id)).claim).not.toBeNull()
        expect(await store.settled(task.parent.id, false)).toBe(false)
        const stopped = new Promise((done) => second.child.once('exit', done))
        second.child.send('close')
        await stopped
    }, 30000)
    it('delivers termination from database without pub/sub and records only the real handler exit', async () => {
        const task = await target(),
            first = worker('cooperate'),
            second = worker('cooperate')
        await first.until('ready')
        await second.until('ready')
        await task.enqueue()
        // Either independent worker may win the unique claim.
        await Promise.race([first.until('started', task.jobId), second.until('started', task.jobId)])
        await store.change(task.parent.id, 'terminated')
        await Promise.race([first.until('completed', task.jobId), second.until('completed', task.jobId)])
        expect(await database.query('SELECT event FROM phase2_tool_receipt WHERE job=$1', [task.jobId])).toEqual([
            { event: 'start' },
            { event: 'exit' }
        ])
        expect(await store.settled(task.parent.id, false)).toBe(true)
        for (const current of [first, second]) {
            const exited = new Promise((done) => current.child.once('exit', done))
            current.child.send('close')
            await exited
        }
    }, 30000)
})
