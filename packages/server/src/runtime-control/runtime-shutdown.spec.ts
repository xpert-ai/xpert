import { fork } from 'node:child_process'
import { get, ClientRequest, IncomingMessage } from 'node:http'
import path from 'node:path'

async function runProcess(mode: string, openStream = false) {
	const child = fork(path.join(__dirname, 'fixtures/shutdown-process.cjs'), [mode], {
		stdio: ['ignore', 'pipe', 'pipe', 'ipc']
	})
	const stages: string[] = []
	let stderr = ''
	let stdout = ''
	let stream = ''
	let httpStarted: () => void
	const started = new Promise<void>((resolve) => {
		httpStarted = resolve
	})
	let responseCompleted: Promise<void> | undefined
	child.stderr.on('data', (chunk) => {
		stderr += chunk
	})
	child.stdout.on('data', (chunk) => {
		stdout += chunk
	})
	const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
		child.once('exit', (code, signal) => resolve({ code, signal }))
	})
	const guard = setTimeout(() => child.kill('SIGKILL'), 8_000)
	let request: ClientRequest | undefined
	let response: IncomingMessage | undefined
	try {
		const port = await new Promise<number>((resolve, reject) => {
			child.on('message', (message: unknown) => {
				if (typeof message !== 'object' || !message) return
				if ('stage' in message && typeof message.stage === 'string') {
					stages.push(message.stage)
					if (message.stage === 'http-started') httpStarted()
				}
				if ('port' in message && typeof message.port === 'number') resolve(message.port)
			})
			child.once('error', reject)
			child.once('exit', () => reject(new Error(`Child exited before ready: ${stderr}`)))
		})
		if (openStream) {
			await new Promise<void>((resolve, reject) => {
				request = get(`http://127.0.0.1:${port}/stream`, (res) => {
					response = res
					res.on('data', (chunk) => {
						stream += chunk
					})
					resolve()
				})
				request.on('error', (error) => {
					if (!response) reject(error)
				})
			})
		}
		if (mode === 'http-drain') {
			responseCompleted = new Promise<void>((resolve, reject) => {
				request = get(`http://127.0.0.1:${port}/work`, (res) => {
					response = res
					res.on('data', (chunk) => {
						stream += chunk
					})
					res.on('end', resolve)
					res.on('error', reject)
				})
				request.on('error', reject)
			})
			await started
		}
		child.send('shutdown')
		const result = await exited
		await responseCompleted
		return { ...result, stages, stderr, stdout, stream }
	} finally {
		clearTimeout(guard)
		response?.destroy()
		request?.destroy()
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL')
			await exited
		}
	}
}

describe('runtime shutdown in a real Node process', () => {
	jest.setTimeout(15_000)
	it('notifies agent SSE clients of interruption and exits without waiting for disconnection', async () => {
		const result = await runProcess('agent-sse', true)
		expect(result).toMatchObject({ code: 0, signal: null })
		expect(result.stages.filter((stage) => stage === 'destroy')).toHaveLength(1)
		expect(result.stages).toContain('redis-disconnected')
		expect(result.stages).not.toContain('cancelled')
		expect(result.stream).toContain('event: runtime-interrupted')
		expect(result.stream).toContain('RUNTIME_RESTARTING')
	})
	it('keeps queues available for a real HTTP request that enqueues work after shutdown begins', async () => {
		const result = await runProcess('http-drain')
		expect(result).toMatchObject({ code: 0, signal: null })
		expect(result.stream).toBe('{"queued":true}')
		expect(result.stages.indexOf('http-job-enqueued')).toBeLessThan(result.stages.indexOf('queue-paused'))
		expect(result.stages.indexOf('queue-paused')).toBeLessThan(result.stages.indexOf('queue-closed'))
		expect(result.stages.indexOf('queue-closed')).toBeLessThan(result.stages.indexOf('destroy'))
		// Exercise the real logger: operators must be able to locate the last reached phase of this PID.
		const events = [
			'handlers-installed',
			'started',
			'http-drain-started',
			'http-drain-finished',
			'queues-discovered',
			'queue-drain-started',
			'queue-drain-finished',
			'queues-closed',
			'nest-close-started',
			'agent-streams-interrupting',
			'agent-streams-closed',
			'response-flush-started',
			'response-flush-finished',
			'finished'
		]
		let previous = -1
		for (const event of events) {
			const position = result.stdout.indexOf(`"event":"runtime.shutdown.${event}"`)
			expect(position).toBeGreaterThan(previous)
			previous = position
		}
		expect(result.stdout).toContain('"exitCode":0')
	})
	it('closes uncooperative HTTP streams at Nest disposal', async () => {
		expect(await runProcess('raw-sse', true)).toMatchObject({ code: 0, signal: null })
	})
	it('exits with a diagnostic when a Nest/plugin hook never settles', async () => {
		const result = await runProcess('stuck-hook')
		expect(result).toMatchObject({ code: 1, signal: null })
		expect(result.stderr).toContain('runtime.shutdown.deadline-exceeded')
		expect(result.stderr).toContain('nest.application-close')
		expect(result.stages.filter((stage) => stage === 'destroy')).toHaveLength(1)
	})
	it('does not destroy dependencies while preparation is still running past half the deadline', async () => {
		const result = await runProcess('slow-prepare')
		expect(result).toMatchObject({ code: 0, signal: null })
		expect(result.stages).toContain('prepare-finished')
		expect(result.stages.indexOf('prepare-finished')).toBeLessThan(result.stages.indexOf('destroy'))
	})
	it('exits at the global deadline instead of destroying dependencies under a stuck preparation', async () => {
		const result = await runProcess('stuck-prepare')
		expect(result).toMatchObject({ code: 1, signal: null })
		expect(result.stderr).toContain('runtime.shutdown.deadline-exceeded')
		expect(result.stderr).toContain('runtime.prepare-close')
		expect(result.stages).not.toContain('destroy')
	})
})
