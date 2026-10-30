import { fork } from 'node:child_process'
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'

describe('Registry installation across API processes', () => {
	let directory: string
	let root: string
	let events: string
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'registry-install-'))
		root = join(directory, 'plugins')
		events = join(directory, 'events.jsonl')
		copyFileSync(join(__dirname, 'fake-npm.test-fixture.cjs'), join(directory, 'npm'))
		chmodSync(join(directory, 'npm'), 0o755)
	})
	afterEach(() => rmSync(directory, { recursive: true, force: true }))
	function install(
		spec: string,
		env: NodeJS.ProcessEnv = {},
		timeoutMs = 5000,
		lockWaitMs = 5000,
		publication: { runtimeName?: string; publishManifest?: boolean } = {}
	) {
		return new Promise<unknown>((resolve, reject) => {
			const child = fork(
				join(__dirname, 'registry-install.test-fixture.cjs'),
				[JSON.stringify({ root, spec, timeoutMs, lockWaitMs, ...publication })],
				{
					env: {
						...process.env,
						PATH: directory + delimiter + process.env.PATH,
						PLUGIN_TEST_EVENTS: events,
						...env
					},
					silent: true
				}
			)
			let response: unknown
			let errors = ''
			const timer = setTimeout(() => {
				child.kill('SIGKILL')
				reject(new Error(errors || 'Fixture timed out'))
			}, 15000)
			child.stderr?.on('data', (chunk) => {
				errors += chunk.toString()
			})
			child.on('message', (value) => {
				response = value
			})
			child.on('error', reject)
			child.on('exit', (code) => {
				clearTimeout(timer)
				if (code !== 0 || !response) reject(new Error(errors || `Fixture exit ${code}`))
				else resolve(response)
			})
		})
	}
	function log() {
		return readFileSync(events, 'utf8')
			.trim()
			.split('\n')
			.map((line): unknown => JSON.parse(line))
	}
	function manifest(): unknown {
		return JSON.parse(readFileSync(join(root, 'org-1/plugins.json'), 'utf8'))
	}
	function target(spec: string) {
		return join(root, 'org-1', spec)
	}
	function legacy(spec = '@test/plugin@1.0.0', complete = false) {
		const packageDir = join(target(spec), 'node_modules/@test/plugin')
		mkdirSync(packageDir, { recursive: true })
		writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: '@test/plugin', version: '1.0.0' }))
		if (complete) writeFileSync(join(packageDir, 'index.js'), 'module.exports = {}')
	}
	it('keeps timers running and hides a partial installation until it is complete', async () => {
		const operation = install('@test/plugin@1.0.0', { PLUGIN_TEST_DELAY_MS: '800' })
		while (!existsSync(events)) await new Promise((resolve) => setTimeout(resolve, 20))
		expect(existsSync(target('@test/plugin@1.0.0'))).toBe(false)
		expect(existsSync(join(root, 'org-1/plugins.json'))).toBe(false)
		const result = await operation
		expect(result).toMatchObject({ success: true, ticks: expect.any(Number) })
		if (typeof result !== 'object' || !result || !('ticks' in result)) throw new Error('Missing timer result')
		expect(result.ticks).toBeGreaterThan(20)
		expect(manifest()).toEqual(['@test/plugin@1.0.0'])
	})
	it('deduplicates same-version installs across processes and serializes distinct manifest updates', async () => {
		const results = await Promise.all([
			install('@test/plugin@1.0.0', { PLUGIN_TEST_DELAY_MS: '400' }),
			install('@test/plugin@1.0.0'),
			install('@test/other@1.0.0')
		])
		expect(results).toEqual(Array(3).fill(expect.objectContaining({ success: true })))
		expect(log()).toHaveLength(4)
		expect(log()).toEqual([
			expect.objectContaining({ action: 'start' }),
			expect.objectContaining({ action: 'finish' }),
			expect.objectContaining({ action: 'start' }),
			expect.objectContaining({ action: 'finish' })
		])
		expect(manifest()).toEqual(expect.arrayContaining(['@test/plugin@1.0.0', '@test/other@1.0.0']))
	})
	it('propagates npm failure, retains the previous version and retries without reusing partial output', async () => {
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: true })
		await expect(install('@test/plugin@2.0.0', { PLUGIN_TEST_FAIL: 'true' })).resolves.toMatchObject({
			success: false
		})
		expect(existsSync(target('@test/plugin@2.0.0'))).toBe(false)
		expect(manifest()).toEqual(['@test/plugin@1.0.0'])
		await expect(install('@test/plugin@2.0.0')).resolves.toMatchObject({ success: true })
		expect(manifest()).toEqual(['@test/plugin@2.0.0'])
		expect(existsSync(target('@test/plugin@1.0.0'))).toBe(true)
	})
	it('stages a replacement in a private runtime directory without changing the previous manifest or artifact', async () => {
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: true })
		const runtimeName = '@test/plugin@runtime__candidate'
		await expect(
			install('@test/plugin@2.0.0', {}, 5000, 5000, { runtimeName, publishManifest: false })
		).resolves.toMatchObject({ success: true })
		expect(manifest()).toEqual(['@test/plugin@1.0.0'])
		expect(existsSync(join(target('@test/plugin@1.0.0'), 'node_modules/@test/plugin/index.js'))).toBe(true)
		expect(existsSync(join(target(runtimeName), 'node_modules/@test/plugin/index.js'))).toBe(true)
	})

	it('kills a timed-out installation before cleaning its stage and releasing the lock', async () => {
		await expect(install('@test/plugin@1.0.0', { PLUGIN_TEST_DELAY_MS: '1500' }, 700)).resolves.toMatchObject({
			success: false
		})
		await new Promise((resolve) => setTimeout(resolve, 1600))
		expect(log()).toEqual([expect.objectContaining({ action: 'start' })])
		expect(readdirSync(join(root, 'org-1/@test'))).toEqual([])
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: true })
	})
	it('bounds an orphan npm process even if the API is killed before cleanup', async () => {
		const child = fork(
			join(__dirname, 'registry-install.test-fixture.cjs'),
			[JSON.stringify({ root, spec: '@test/plugin@1.0.0', timeoutMs: 1500 })],
			{
				env: {
					...process.env,
					PATH: directory + delimiter + process.env.PATH,
					PLUGIN_TEST_EVENTS: events,
					PLUGIN_TEST_DELAY_MS: '10000'
				},
				silent: true
			}
		)
		try {
			const deadline = Date.now() + 4000
			while (!existsSync(events) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
			const event = log()[0]
			if (typeof event !== 'object' || !event || !('pid' in event) || typeof event.pid !== 'number')
				throw new Error('Missing npm pid')
			const pid = event.pid
			const exited = new Promise((resolve) => child.once('exit', resolve))
			child.kill('SIGKILL')
			await exited
			await new Promise((resolve) => setTimeout(resolve, 1800))
			expect(() => process.kill(pid, 0)).toThrow()
			expect(log()).toHaveLength(1)
			expect(existsSync(target('@test/plugin@1.0.0'))).toBe(false)
		} finally {
			child.kill('SIGKILL')
		}
	}, 10000)

	it('repairs incomplete legacy artifacts instead of treating package.json as completion', async () => {
		legacy()
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: true })
		expect(log()).toHaveLength(2)
		expect(existsSync(join(target('@test/plugin@1.0.0'), '.xpert-registry-install.json'))).toBe(true)
	})
	it('validates legacy dependencies before adopting an existing complete artifact', async () => {
		legacy('@test/plugin@1.0.0', true)
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: true })
		expect(log()).toEqual([{ action: 'validate' }])
	})
	it('rebuilds legacy artifacts when their dependency validation fails', async () => {
		legacy('@test/plugin@1.0.0', true)
		await expect(install('@test/plugin@1.0.0', { PLUGIN_TEST_INVALID_LEGACY: 'true' })).resolves.toMatchObject({
			success: true
		})
		expect(log()).toHaveLength(3)
	})
	it('does not replace a corrupt manifest with an empty one', async () => {
		mkdirSync(join(root, 'org-1'), { recursive: true })
		writeFileSync(join(root, 'org-1/plugins.json'), '{broken')
		await expect(install('@test/plugin@1.0.0')).resolves.toMatchObject({ success: false })
		expect(readFileSync(join(root, 'org-1/plugins.json'), 'utf8')).toBe('{broken')
	})
})
