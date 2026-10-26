import { fork, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { controlRolloutFixture, until } from './testing/control-rollout.fixture'
import { withTaskControl } from '../task-control/task-control.context'
import { taskControlId } from '../task-control/task-control.store'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
	redis = process.env.XPERT_CONTROL_TEST_REDIS_URL
const legacy = process.env.XPERT_CONTROL_LEGACY_SOURCE
const integration = url && redis && legacy ? describe : describe.skip
integration('actual pre-4.2.1 worker alongside current queue admission', () => {
	let f: Awaited<ReturnType<typeof controlRolloutFixture>>, old: ChildProcess
	const notices: Array<{ type: string; jobId?: string; message?: string }> = []
	let diagnostics = ''
	beforeAll(async () => {
		f = await controlRolloutFixture(url, redis)
		old = fork(
			join(legacy, 'packages/server-ai/src/execution-control/testing/control-phase2.worker.ts'),
			[
				JSON.stringify({
					schema: f.schema,
					queue: f.legacy.name,
					mode: 'cooperate',
					database: url,
					redis
				})
			],
			{
				cwd: legacy,
				execArgv: ['-r', require.resolve('ts-node/register/transpile-only')],
				env: {
					...process.env,
					TS_NODE_PROJECT: join(legacy, 'packages/server-ai/tsconfig.spec.json'),
					TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node' })
				},
				silent: true
			}
		)
		old.stderr.on('data', (chunk) => {
			diagnostics += chunk.toString()
		})
		old.on('message', (message) => {
			if (typeof message === 'object' && message && 'type' in message && typeof message.type === 'string')
				notices.push(message as { type: string; jobId?: string; message?: string })
		})
		await until(async () => {
			if (old.exitCode !== null || old.signalCode !== null)
				throw new Error(diagnostics || JSON.stringify(notices))
			return notices.some((item) => item.type === 'ready')
		}, 30000)
	}, 45000)
	afterAll(async () => {
		if (old && old.exitCode === null && old.signalCode === null) {
			old.send('close')
			await new Promise<void>((done) => {
				old.once('exit', () => done())
				setTimeout(() => {
					old.kill('SIGKILL')
					done()
				}, 3000).unref()
			})
		}
		await f?.close()
	})

	it('reproduces v2 ignoring handler requirements, then isolates the same requirement from that old process', async () => {
		const parent = await f.controls.register({
			...f.scope,
			kind: 'execution',
			resourceId: randomUUID(),
			executionId: randomUUID()
		})
		const jobId = randomUUID()
		const registration = {
			...f.scope,
			kind: 'managed-queue' as const,
			resourceId: `default/${jobId}`,
			parent: { version: 2 as const, targetId: parent.id }
		}
		const targetId = taskControlId(registration)
		// Baseline uses the archived production v2 runner; the extra requirement was ignored by that worker.
		const envelope = {
			...f.identity,
			...f.scope,
			payload: {},
			executionPool: 'default' as const,
			enqueuedAt: new Date().toISOString(),
			control: { version: 2 as const, targetId },
			controlProtocol: 3 as const
		}
		await f.controls.publish(registration, { envelope, options: { jobId } })
		await f.legacy.add('execute', envelope, { jobId })
		await until(async () => notices.some((item) => item.type === 'started' && item.jobId === jobId))
		expect(await f.database.query('SELECT event FROM phase2_tool_receipt WHERE job = $1', [jobId])).toEqual([
			{ event: 'start' }
		])
		await f.controls.change(parent.id, 'terminated')
		await until(async () => (await f.controls.read(targetId)).state === 'completed')

		let calls = 0
		f.handlers.register({
			...f.identity,
			handler: async () => {
				calls++
			}
		})
		const next = await f.controls.register({
			...f.scope,
			kind: 'execution',
			resourceId: randomUUID(),
			executionId: randomUUID()
		})
		await f.ready()
		const created = await withTaskControl({ version: 2, targetId: next.id }, () =>
			f.service.enqueue({ ...f.identity, ...f.scope, payload: {}, controlPolicy: 'attached' })
		)
		expect(await f.legacy.getJob(created.jobId)).toBeUndefined()
		expect(
			(await f.controls.publications('managed-queue')).every(
				(row) =>
					row.targetId !==
					taskControlId({ ...f.scope, kind: 'managed-queue', resourceId: `default/${created.jobId}` })
			)
		).toBe(true)
		await f.worker()
		await until(async () => calls === 1)
		expect(notices.filter((item) => item.jobId === created.jobId)).toEqual([])
		expect(await f.database.query('SELECT event FROM phase2_tool_receipt WHERE job = $1', [created.jobId])).toEqual(
			[]
		)
		console.info(
			JSON.stringify({
				before: { incompatibleOldWorkerStarts: 1 },
				after: { incompatibleOldWorkerStarts: 0, compatibleWorkerStarts: calls }
			})
		)
	}, 30000)
})
