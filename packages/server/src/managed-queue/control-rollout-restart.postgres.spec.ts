import { randomUUID } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { withTaskControl } from '../task-control/task-control.context'
import { TaskControlStore } from '../task-control/task-control.store'
import { RuntimeDrainMiddleware } from '../runtime-control/runtime-drain.middleware'
import { RuntimeLifecycleService } from '../runtime-control/runtime-lifecycle.service'
import { controlRolloutFixture, until } from './testing/control-rollout.fixture'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
	redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
const integration = url && redisUrl ? describe : describe.skip
integration('controlled queue withdrawal, redelivery and competing consumers', () => {
	let f: Awaited<ReturnType<typeof controlRolloutFixture>>
	let release: (() => void) | undefined
	let server: Server | undefined
	beforeEach(async () => {
		f = await controlRolloutFixture(url, redisUrl)
	})
	afterEach(async () => {
		release?.()
		release = undefined
		if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
		server = undefined
		await f.close()
	})
	async function enqueue() {
		const parent = await f.controls.register({
			...f.scope,
			kind: 'execution',
			resourceId: randomUUID(),
			executionId: randomUUID()
		})
		await f.ready()
		const job = await withTaskControl({ version: 2, targetId: parent.id }, () =>
			f.service.enqueue({ ...f.scope, ...f.identity, controlPolicy: 'attached', payload: {} })
		)
		const task = await f.controls.find(f.scope, 'managed-queue', `default/${job.jobId}`)
		return { parent, task, jobId: job.jobId }
	}
	it('delays without claiming when the consumer is withdrawn, then executes once after readmission', async () => {
		let calls = 0
		f.handlers.register({
			...f.identity,
			handler: async () => {
				calls++
			}
		})
		const { task, jobId } = await enqueue()
		await f.instances.setReady(false)
		await f.worker()
		await until(async () => (await f.admitted.getJob(jobId)).getState().then((state) => state === 'delayed'))
		expect(await f.controls.read(task.id)).toMatchObject({ claim: null })
		expect(calls).toBe(0)
		await f.ready()
		await until(async () => (await f.controls.read(task.id)).state === 'completed')
		expect(calls).toBe(1)
	})
	it('keeps the claim through a lost exit receipt and two competing consumers; no tool replay', async () => {
		let calls = 0
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		f.handlers.register({
			...f.identity,
			handler: async () => {
				calls++
				await gate
			}
		})
		const { task } = await enqueue()
		await Promise.all([f.worker(), f.worker()])
		await until(async () => calls === 1)
		const receipt = jest.spyOn(f.controls, 'finishClaim').mockRejectedValue(new Error('temporary database outage'))
		release()
		await until(async () => receipt.mock.calls.length > 0)
		expect(await f.controls.read(task.id)).toMatchObject({ state: 'running', claim: expect.any(String) })
		await expect(new TaskControlStore(f.database).claim(task.id)).rejects.toMatchObject({ reason: 'claimed' })
		receipt.mockRestore()
		await f.runner.reconcile()
		await until(async () => (await f.controls.read(task.id)).state === 'completed')
		expect(calls).toBe(1)
	})
	it('retries an HTTP control after an acknowledgement is lost, and polls durable intent while unready', async () => {
		let calls = 0,
			aborted = false
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
		const { parent, task } = await enqueue()
		await f.worker()
		await until(async () => calls === 1)
		await f.instances.setReady(false)
		const lifecycle = new RuntimeLifecycleService()
		lifecycle.setReadinessGuard(() => false)
		const middleware = new RuntimeDrainMiddleware(lifecycle)
		const app = express().use(middleware.use.bind(middleware))
		// This narrow fixture substitutes authentication only; the durable store/runner and HTTP middleware are real.
		let lost = true,
			accepted = 0
		app.post('/api/ai/threads/t/runs/r/cancel', async (req, res) => {
			if (req.headers.authorization !== 'Bearer isolated-test') return res.sendStatus(401)
			await new TaskControlStore(f.database).change(parent.id, 'terminated')
			accepted++
			if (lost) {
				lost = false
				req.socket.destroy()
				return
			}
			res.sendStatus(202)
		})
		server = await new Promise<Server>((resolve) => {
			const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
		})
		const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/threads/t/runs/r/cancel`
		const send = () => fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer isolated-test' } })
		await expect(send()).rejects.toThrow()
		expect((await send()).status).toBe(202)
		await until(async () => aborted)
		expect(accepted).toBe(2)
		expect(await f.controls.read(task.id)).toMatchObject({ state: 'running', claim: expect.any(String) })
		release()
		await until(async () => (await f.controls.read(task.id)).state === 'completed')
		await expect(f.controls.change(parent.id, 'running')).rejects.toMatchObject({ reason: 'terminated' })
		expect(calls).toBe(1)
		console.info(
			'After repair: lost HTTP ack retried; durable control delivered while unready; no early release; toolCalls=1'
		)
	})
	it('lets a paused parent finish its necessary child during withdrawal without admitting unrelated work', async () => {
		let calls = 0
		f.handlers.register({
			...f.identity,
			handler: async () => {
				calls++
			}
		})
		const parent = await f.controls.register({
			...f.scope,
			kind: 'execution',
			resourceId: randomUUID(),
			executionId: randomUUID()
		})
		await f.ready()
		await f.controls.change(parent.id, 'paused')
		await f.instances.setReady(false)
		await f.admission.refresh()
		const publish = (drainOnPause: boolean) =>
			withTaskControl({ version: 2, targetId: parent.id }, () =>
				f.service.enqueue({ ...f.scope, ...f.identity, payload: {}, controlPolicy: 'attached', drainOnPause })
			)
		await expect(publish(false)).rejects.toMatchObject({ response: { reason: 'worker' } })
		const { jobId } = await publish(true)
		const task = await f.controls.find(f.scope, 'managed-queue', `default/${jobId}`)
		await f.worker()
		await until(async () => (await f.controls.read(task.id)).state === 'completed')
		expect(calls).toBe(1)
		expect(await f.controls.desired(parent.id)).toBe('paused')
	})
})
