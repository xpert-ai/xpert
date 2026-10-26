import { fork, ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { sandboxTestEntities } from './testing/postgres-entities'
import { SandboxJobEntity } from './sandbox-job.entity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('Sandbox original host / independent OS replicas', () => {
    const schema = `sandbox_workers_${randomUUID().replaceAll('-', '')}`,
        tenant = randomUUID()
    let db: DataSource
    const workers: ChildProcess[] = []
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw Error('Disposable database required')
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
        await db.query('INSERT INTO tenant(id) VALUES ($1)', [tenant])
        await db.query(
            'CREATE TABLE fixture_host(id uuid PRIMARY KEY); CREATE TABLE fixture_effect(kind varchar); CREATE TABLE fixture_command(id uuid PRIMARY KEY, host uuid, sequence serial, op varchar, job uuid, key varchar, done boolean DEFAULT false, result jsonb)'
        )
    })
    afterAll(async () => {
        for (const worker of workers) if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL')
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    async function worker() {
        const host = randomUUID()
        const child = fork(
            require.resolve('jest/bin/jest'),
            [
                '--config',
                process.env.XPERT_HOST_TEST_JEST_CONFIG ?? path.resolve(__dirname, '../../../jest.config.ts'),
                '--runInBand',
                '--runTestsByPath',
                path.join(__dirname, 'testing/control.worker.spec.ts')
            ],
            {
                silent: true,
                env: { ...process.env, XPERT_SANDBOX_CONTROL_WORKER: JSON.stringify({ url, schema, host, tenant }) }
            }
        )
        workers.push(child)
        let output = ''
        child.stdout.on('data', (data) => {
            output += data
        })
        child.stderr.on('data', (data) => {
            output += data
        })
        async function wait(query: string, args: string[]) {
            const until = Date.now() + 45000
            while (Date.now() < until) {
                const rows: unknown[] = await db.query(query, args)
                if (rows.length) return rows[0]
                if (child.exitCode !== null) throw new Error(output)
                await new Promise((resolve) => setTimeout(resolve, 30))
            }
            throw new Error(`Worker timed out: ${output}`)
        }
        await wait('SELECT id FROM fixture_host WHERE id=$1', [host])
        return async (op: string, job?: string, key?: string) => {
            const id = randomUUID()
            await db.query('INSERT INTO fixture_command(id,host,op,job,key) VALUES ($1,$2,$3,$4,$5)', [
                id,
                host,
                op,
                job ?? null,
                key ?? null
            ])
            const row = z
                .object({
                    result: z.object({
                        job: z.string().uuid().optional(),
                        owner: z.boolean().optional(),
                        error: z.string().optional()
                    })
                })
                .parse(await wait('SELECT result FROM fixture_command WHERE id=$1 AND done=true', [id]))
            if (row.result.error) throw new Error(row.result.error)
            return row.result
        }
    }
    it('persists cancellation on B, redelivers on A, and waits for the actual ignoring host callback', async () => {
        const a = await worker(),
            b = await worker(),
            key = randomUUID()
        const first = await a('start', undefined, key)
        expect(first.owner).toBe(true)
        expect((await b('start', undefined, key)).owner).toBe(false)
        await b('stop', first.job)
        await b('tick')
        let job = await db.getRepository(SandboxJobEntity).findOneByOrFail({ id: first.job })
        expect(job.status).toBe('cancelling')
        expect(job.finishedAt).toBeNull()
        expect(job.capacityHeld).toBe(true)
        await a('tick')
        await new Promise((resolve) => setTimeout(resolve, 80))
        await a('tick')
        job = await db.getRepository(SandboxJobEntity).findOneByOrFail({ id: first.job })
        expect(job.capacityHeld).toBe(true)
        expect(job.control.hostExited).toBe(false)
        await a('release', first.job)
        job = await db.getRepository(SandboxJobEntity).findOneByOrFail({ id: first.job })
        expect(job.status).toBe('cancelled')
        expect(job.capacityHeld).toBe(false)
        expect((await b('start', undefined, key)).owner).toBe(false)
        const effects = z
            .array(z.object({ kind: z.string(), count: z.string() }))
            .parse(await db.query('SELECT kind,count(*) FROM fixture_effect GROUP BY kind ORDER BY kind'))
        expect(effects).toEqual([
            { kind: 'callback', count: '1' },
            { kind: 'execution', count: '1' }
        ])
        console.log(
            'AFTER_TWO_OS_REPLICAS',
            JSON.stringify({ starts: 1, callbacks: 1, heldUntilCallbackReturned: true, finalStatus: job.status })
        )
        await a('close')
        await b('close')
    }, 100000)
})
