import { randomUUID } from 'node:crypto'
import { withTaskControl } from '../task-control/task-control.context'
import { TaskControlPublication } from '../task-control/task-control-publication.entity'
import { controlRolloutFixture, until } from './testing/control-rollout.fixture'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
	redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
const integration = url && redisUrl ? describe : describe.skip
integration('mixed-version queue admission and restart recovery', () => {
	let f: Awaited<ReturnType<typeof controlRolloutFixture>>
	beforeEach(async () => {
		f = await controlRolloutFixture(url, redisUrl)
	})
	afterEach(async () => {
		await f?.close()
	})
	async function root() {
		return f.controls.register({
			...f.scope,
			kind: 'execution',
			resourceId: randomUUID(),
			executionId: randomUUID()
		})
	}
	async function enqueue(
		parent: string,
		extra: {
			jobId?: string
			controlContract?: string
			drainOnPause?: boolean
			controlPolicy?: 'attached' | 'detached' | 'shared'
		} = {}
	) {
		await f.ready()
		return withTaskControl({ version: 2, targetId: parent }, () =>
			f.service.enqueue({ ...f.identity, ...f.scope, payload: {}, controlPolicy: 'attached', ...extra })
		)
	}

	it('rejects legacy/mismatched handlers and missing migrations before publication or side effects', async () => {
		const parent = await root(),
			body = jest.fn()
		f.handlers.register({ ...f.identity, controlContract: undefined, handler: body })
		await expect(enqueue(parent.id)).rejects.toMatchObject({ response: { reason: 'worker' } })
		f.handlers.register({ ...f.identity, controlContract: 'other-contract', handler: body })
		await expect(enqueue(parent.id)).rejects.toMatchObject({ response: { reason: 'worker' } })
		expect(await f.database.getRepository(TaskControlPublication).count()).toBe(0)
		f.handlers.register({ ...f.identity, handler: body })
		await f.database.query('ALTER TABLE execution_task_control DROP COLUMN "deliveryUntil"')
		await expect(enqueue(parent.id)).rejects.toMatchObject({ response: { reason: 'schema' } })
		expect(body).not.toHaveBeenCalled()
	})

	it('redelivers accepted control while unready and retains the claim until the actual handler exits', async () => {
		const parent = await root()
		let release!: () => void,
			aborted = false,
			calls = 0
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		f.handlers.register({
			...f.identity,
			handler: async (_job, context) => {
				calls++
				context.control.signal.addEventListener(
					'abort',
					() => {
						aborted = true
					},
					{ once: true }
				)
				await gate
			}
		})
		await f.worker()
		const { jobId } = await enqueue(parent.id)
		await until(async () => calls === 1)
		const task = await f.controls.find(f.scope, 'managed-queue', `default/${jobId}`)
		await f.instances.setReady(false)
		await f.controls.change(parent.id, 'terminated')
		// No pub/sub delivery is made. The original runner must poll the durable intent.
		await until(async () => aborted)
		expect(await f.controls.read(task.id)).toMatchObject({ state: 'running', claim: expect.any(String) })
		await expect(f.controls.claim(task.id)).rejects.toMatchObject({ reason: 'terminated' })
		release()
		await until(async () => (await f.controls.read(task.id)).state === 'completed')
		await f.ready()
		await expect(f.controls.change(parent.id, 'running')).rejects.toMatchObject({ reason: 'terminated' })
		expect(calls).toBe(1)
	})

	it('isolates the new outbox from old reconcilers and republishes only to the v3 queue after restart', async () => {
		const parent = await root()
		f.handlers.register({ ...f.identity, handler: async () => undefined })
		const add = jest.spyOn(f.admitted, 'add').mockRejectedValueOnce(new Error('Redis unavailable'))
		const { jobId } = await enqueue(parent.id)
		expect(await f.controls.publications('managed-queue')).toEqual([])
		const rows = await f.database.getRepository(TaskControlPublication).find()
		expect(rows).toHaveLength(1)
		expect(rows[0].transport).toBe('managed-queue-v3')
		add.mockRestore()
		await f.database
			.getRepository(TaskControlPublication)
			.update({ targetId: rows[0].targetId }, { nextAttemptAt: new Date(0) })
		await f.service.reconcilePublications()
		expect(await f.legacy.getJob(jobId)).toBeUndefined()
		expect((await f.admitted.getJob(jobId)).data).toMatchObject({
			controlProtocol: 3,
			controlContract: f.identity.controlContract
		})
		expect((await f.controls.publication(rows[0].targetId)).publishedAt).not.toBeNull()
	})

	it('rejects old boot/expired/rolled-back capabilities and reopens only after a compatible fresh report', async () => {
		const parent = await root()
		f.handlers.register({ ...f.identity, handler: async () => undefined })
		await f.ready()
		const key = `managed-connection:instance:${f.instances.instanceId}`
		const saved = JSON.parse(await f.redis.get(key))
		for (const value of [
			{ ...saved, bootId: randomUUID() },
			{ ...saved, executionControl: undefined },
			{ ...saved, executionControl: { ...saved.executionControl, queuePrefix: 'unrelated-environment' } },
			{ ...saved, executionControl: { ...saved.executionControl, validUntil: 0 } },
			{
				...saved,
				executionControl: {
					...saved.executionControl,
					handlers: [{ ...f.identity, scopeKey: null, controlContract: 'rollback/old' }]
				}
			}
		]) {
			await f.redis.set(key, JSON.stringify(value))
			await expect(
				f.admission.requireQueueWorker({ ...f.identity, scopeKey: null }, 'default')
			).rejects.toMatchObject({ response: { reason: 'worker' } })
		}
		await f.redis.set(key, JSON.stringify(saved))
		await expect(
			f.admission.requireQueueWorker({ ...f.identity, scopeKey: null }, 'default')
		).resolves.toBeUndefined()
		expect(await f.controls.read(parent.id)).toMatchObject({ desired: 'running' })
	})

	it('allows necessary child work to drain a paused parent while independent/shared roots continue', async () => {
		const parent = await root(),
			calls: string[] = []
		f.handlers.register({
			...f.identity,
			handler: async (job) => {
				calls.push(job.id)
			}
		})
		await f.controls.change(parent.id, 'paused')
		const child = await enqueue(parent.id, { drainOnPause: true })
		const independent = await enqueue(parent.id, { controlPolicy: 'detached' })
		const shared = await enqueue(parent.id, { controlPolicy: 'shared' })
		await f.worker()
		await until(async () => calls.length === 3)
		await f.controls.change(parent.id, 'terminated')
		for (const jobId of [independent.jobId, shared.jobId]) {
			const task = await f.controls.find(f.scope, 'managed-queue', `default/${jobId}`)
			expect(await f.controls.desired(task.id)).toBe('running')
		}
		expect(calls.filter((id) => id === child.jobId)).toHaveLength(1)
	})
})
