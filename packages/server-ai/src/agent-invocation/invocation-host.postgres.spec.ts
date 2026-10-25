import { fork, ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { z } from 'zod'
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('original host control across real OS processes and PostgreSQL', () => {
    const schema = `host_control_${randomUUID().replace(/-/g, '')}`
    let db: DataSource
    const children: ChildProcess[] = []
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw Error('Disposable database required')
        db = await new DataSource({
            type: 'postgres',
            url,
            extra: { options: `-c search_path=${schema}` }
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.query(
            'CREATE TABLE invocation(id uuid PRIMARY KEY,revision int,data jsonb); CREATE TABLE effect(event varchar); CREATE TABLE host(id uuid); CREATE TABLE command(id uuid,host uuid,op varchar,invocation uuid,created serial,done boolean DEFAULT false,response jsonb)'
        )
    })
    afterAll(async () => {
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    async function host() {
        const hostId = randomUUID()
        const child = fork(
            require.resolve('jest/bin/jest'),
            [
                '--config',
                process.env.XPERT_HOST_TEST_JEST_CONFIG ?? resolve(__dirname, '../../jest.config.ts'),
                '--runInBand',
                '--runTestsByPath',
                resolve(__dirname, 'testing/host-control.worker.spec.ts')
            ],
            {
                silent: true,
                env: { ...process.env, XPERT_HOST_FIXTURE: JSON.stringify({ url, schema, host: hostId }) }
            }
        )
        children.push(child)
        let output = ''
        child.stderr.on('data', (chunk) => (output += chunk))
        child.stdout.on('data', (chunk) => (output += chunk))
        const wait = async (id?: string) => {
            const limit = Date.now() + 55_000
            while (Date.now() < limit) {
                if (!id && (await db.query('SELECT id FROM host WHERE id=$1', [hostId])).length) return
                if (id) {
                    const rows = await db.query('SELECT response FROM command WHERE id=$1 AND done=true', [id])
                    if (rows.length) {
                        const item = z
                            .object({
                                result: z.object({ id: z.string(), status: z.string() }).passthrough().optional(),
                                error: z.string().optional()
                            })
                            .parse(rows[0].response)
                        if (item.error) throw Error(item.error)
                        return item.result
                    }
                }
                if (child.exitCode !== null) throw Error(output)
                await new Promise((done) => setTimeout(done, 30))
            }
            throw Error('Host fixture timed out: ' + output)
        }
        await wait()
        return {
            pid: child.pid,
            call: async (op: string, invocationId?: string) => {
                const id = randomUUID()
                await db.query('INSERT INTO command(id,host,op,invocation) VALUES ($1,$2,$3,$4)', [
                    id,
                    hostId,
                    op,
                    invocationId ?? null
                ])
                return wait(id)
            }
        }
    }
    it('adds Desktop evidence idempotently without certifying legacy terminal records', async () => {
        await db.query('CREATE TABLE desktop_shell_operation(id uuid, state varchar)')
        await db.query("INSERT INTO desktop_shell_operation VALUES ($1,'cancelled')", [randomUUID()])
        const migration = await readFile(
            resolve(__dirname, '../desktop-shell/migrations/20261023-desktop-shell-completion.sql'),
            'utf8'
        )
        await db.query(migration)
        await db.query(migration)
        expect(await db.query('SELECT state,completion FROM desktop_shell_operation')).toEqual([
            { state: 'cancelled', completion: null }
        ])
    })
    it('compensates lost notification without replay; withholds release until the original tool exits', async () => {
        const [a, b] = await Promise.all([host(), host()])
        expect(a.pid).not.toBe(b.pid)
        const started = await a.call('start')
        expect((await b.call('cancel', started.id)).status).toBe('cancelling')
        expect(await db.query("SELECT * FROM effect WHERE event='cancel_delivered'")).toHaveLength(0)
        expect((await a.call('poll')).status).toBe('cancelling')
        expect((await b.call('start')).status).toBe('cancelling')
        expect((await a.call('release')).status).toBe('cancelled')
        expect((await b.call('start')).status).toBe('cancelled')
        const effects = await db.query('SELECT event,count(*)::int AS count FROM effect GROUP BY event ORDER BY event')
        expect(effects).toEqual([
            { event: 'cancel_delivered', count: 3 },
            { event: 'tool_exit', count: 1 },
            { event: 'tool_start', count: 1 }
        ])
        console.log('AFTER_CROSS_REPLICA', {
            originalHostReached: true,
            startCount: 1,
            toolCount: 1,
            toolExitCount: 1,
            releasedBeforeExit: false
        })
        await a.call('close')
        await b.call('close')
    }, 90_000)
})
