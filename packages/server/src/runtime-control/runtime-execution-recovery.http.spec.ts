import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { RuntimeDrainMiddleware } from './runtime-drain.middleware'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { randomUUID } from 'node:crypto'

describe('execution control during runtime upgrade', () => {
	let server: Server
	afterEach(
		() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
	)
	it('keeps exact-run termination reachable through authentication while business admission is closed', async () => {
		const lifecycle = new RuntimeLifecycleService()
		lifecycle.setReadinessGuard(() => false)
		const middleware = new RuntimeDrainMiddleware(lifecycle)
		const app = express()
		let accepted = 0
		app.use(middleware.use.bind(middleware))
		app.post('/api/ai/threads/thread-1/runs/run-1/cancel', (req, res) => {
			if (req.headers.authorization !== 'Bearer isolated-test') return res.sendStatus(401)
			accepted++
			return res.sendStatus(202)
		})
		server = await new Promise<Server>((resolve) => {
			const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
		})
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/threads/thread-1/runs/run-1/cancel`
		const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer isolated-test' } })
		expect({ status: response.status, accepted }).toEqual({ status: 202, accepted: 1 })
		expect((await fetch(url, { method: 'POST' })).status).toBe(401)
		lifecycle.beginDrain({ restartId: 'restart', requestedAt: new Date().toISOString() })
		expect((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer isolated-test' } })).status).toBe(
			503
		)
		expect(accepted).toBe(1)
	})

	it('admits only finite reads, original control and MCP control negotiation; never tools or resume', async () => {
		const lifecycle = new RuntimeLifecycleService()
		lifecycle.setReadinessGuard(() => false)
		const middleware = new RuntimeDrainMiddleware(lifecycle)
		const app = express().use(express.json())
		app.use(middleware.use.bind(middleware))
		let authorized = 0
		app.use((req, res) => {
			if (req.headers.authorization !== 'Bearer isolated-test') return res.sendStatus(401)
			authorized++
			return res.sendStatus(200)
		})
		server = await new Promise<Server>((resolve) => {
			const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
		})
		const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
		const send = (path: string, method = 'POST', body?: object, auth = true) =>
			fetch(origin + path, {
				method,
				headers: {
					'Content-Type': 'application/json',
					...(auth ? { Authorization: 'Bearer isolated-test' } : {})
				},
				...(body ? { body: JSON.stringify(body) } : {})
			})
		const identity = {
			version: 1,
			operationId: randomUUID(),
			generation: randomUUID(),
			serverId: randomUUID(),
			toolName: 'test',
			inputHash: 'a'.repeat(64)
		}
		for (const action of ['inspect', 'terminate']) {
			const body = { method: 'xpert/tasks/control', params: { ...identity, action, _meta: {} } }
			expect((await send('/api/mcp/p/isolated', 'POST', body, false)).status).toBe(401)
			expect((await send('/api/mcp/p/isolated', 'POST', body)).status).toBe(200)
		}
		for (const method of ['server/discover', 'initialize', 'notifications/initialized'])
			expect((await send('/api/mcp/p/isolated', 'POST', { method })).status).toBe(200)
		for (const path of [
			'/api/ai/threads/t/control-view',
			'/api/ai/threads/t/capabilities',
			'/api/ai/threads/t/runs/r',
			'/api/agent-invocations/id'
		])
			expect((await send(path, 'GET')).status).toBe(200)
		const before = authorized
		for (const body of [
			{ method: 'tools/call', params: { name: 'test' } },
			{ method: 'xpert/tasks/control', params: { ...identity, action: 'resume' } },
			{ method: 'xpert/tasks/control', params: { ...identity, action: 'terminate', generation: 'invalid' } },
			[{ method: 'xpert/tasks/control', params: { ...identity, action: 'terminate' } }, { method: 'tools/call' }]
		])
			expect((await send('/api/mcp/p/isolated', 'POST', body)).status).toBe(503)
		for (const path of [
			'/api/ai/threads/t/runs',
			'/api/ai/threads/t/runs/r/resume',
			'/api/ai/threads/t/runs/r/cancel/extra',
			'/api/agent-invocations/id/respond'
		])
			expect((await send(path)).status).toBe(503)
		expect(authorized).toBe(before)
		lifecycle.beginDrain({ restartId: 'shutdown', requestedAt: new Date().toISOString() })
		expect((await send('/api/mcp/p/isolated', 'POST', { method: 'server/discover' })).status).toBe(503)
	})
})
