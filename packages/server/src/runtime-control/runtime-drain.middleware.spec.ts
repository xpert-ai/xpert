import express from 'express'
import { type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import { RuntimeDrainMiddleware } from './runtime-drain.middleware'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

describe('runtime recovery HTTP admission', () => {
	let server: Server
	afterEach(
		() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
	)
	async function fixture(ready = false) {
		const lifecycle = new RuntimeLifecycleService()
		lifecycle.setReadinessGuard(() => ready)
		const middleware = new RuntimeDrainMiddleware(lifecycle)
		const app = express()
		app.use(middleware.use.bind(middleware))
		// Authentication remains downstream of readiness admission, as in Nest.
		app.use((req, res) => {
			if (req.headers.authorization !== 'Bearer test-admin') return res.sendStatus(401)
			return res.json({ activeRequests: lifecycle.readiness().activeRequests })
		})
		server = await new Promise<Server>((resolve) => {
			const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
		})
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
		const send = (path: string, method = 'POST', authenticated = true) =>
			fetch(origin + path, { method, headers: authenticated ? { Authorization: 'Bearer test-admin' } : {} })
		return { send, lifecycle }
	}

	it.each([
		'/api/plugin',
		'/api/plugin/refresh',
		'/api/plugin/by-names',
		'/api/auth/login',
		'/api/system/runtime/restart'
	])('keeps %s reachable through authentication while unready', async (path) => {
		const { send, lifecycle } = await fixture()
		expect((await send(path, 'POST', false)).status).toBe(401)
		const response = await send(path)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ activeRequests: 1 })
		expect(lifecycle.readiness()).toMatchObject({ status: 'unready', activeRequests: 0 })
	})

	it.each([
		'/api/xpert',
		'/api/code_review/github/webhook',
		'/api/plugin/anything',
		'/api/auth/signup',
		'/api/plugin/refresh/extra'
	])('continues fencing non-recovery requests at %s', async (path) => {
		const { send } = await fixture()
		expect((await send(path)).status).toBe(503)
	})

	it('does not admit another method, and still rejects recovery during drain', async () => {
		const { send, lifecycle } = await fixture()
		expect((await send('/api/plugin', 'DELETE')).status).toBe(503)
		lifecycle.beginDrain({ restartId: 'test-restart', requestedAt: new Date().toISOString() })
		expect((await send('/api/plugin')).status).toBe(503)
	})

	it('serves normal authenticated business requests when ready', async () => {
		const { send } = await fixture(true)
		expect((await send('/api/xpert')).status).toBe(200)
	})
	it('returns structured rejection metadata and serves during readiness withdrawal', async () => {
		const { send, lifecycle } = await fixture(true)
		const state = { restartId: 'withdraw', requestedAt: new Date().toISOString() }
		lifecycle.beginWithdrawal(state)
		expect(lifecycle.readiness().status).toBe('withdrawing')
		expect((await send('/api/xpert')).status).toBe(200)
		lifecycle.beginDrain(state)
		const response = await send('/api/ai/v1/chatkit/sessions')
		expect(response.status).toBe(503)
		expect(response.headers.get('retry-after')).toBe('5')
		expect(response.headers.get('x-request-id')).toMatch(/^[\da-f-]{36}$/)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(await response.json()).toMatchObject({
			errorCode: 'RUNTIME_DRAINING',
			reason: 'draining',
			retryAfter: 5
		})
		lifecycle.cancelDrain(state.restartId)
		expect((await send('/api/xpert')).status).toBe(200)
	})
})
