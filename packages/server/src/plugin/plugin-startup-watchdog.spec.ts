import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

describe('startup watchdog in a real process', () => {
	let directory: string
	let modulePath: string
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'plugin-watchdog-'))
		modulePath = join(directory, 'watchdog.cjs')
		const source = readFileSync(join(__dirname, 'plugin-startup-watchdog.ts'), 'utf8')
		writeFileSync(
			modulePath,
			ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
		)
	})
	afterEach(() => rmSync(directory, { recursive: true, force: true }))

	async function run(body: string) {
		const child = spawn(process.execPath, [
			'-e',
			`const { createPluginStartupWatchdog } = require(${JSON.stringify(modulePath)}); ${body}`
		])
		let stderr = ''
		child.stderr.on('data', (data: Buffer) => {
			stderr += data.toString()
		})
		return await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stderr: string }>(
			(resolve, reject) => {
				const deadline = setTimeout(() => {
					child.kill('SIGKILL')
					reject(new Error('Watchdog did not stop the child'))
				}, 5000)
				child.once('error', (error) => {
					clearTimeout(deadline)
					reject(error)
				})
				child.once('exit', (code, signal) => {
					clearTimeout(deadline)
					resolve({ code, signal, stderr })
				})
			}
		)
	}

	it('kills a CPU-blocked candidate and identifies its last startup stage', async () => {
		const state = join(directory, 'state.json')
		writeFileSync(
			state,
			JSON.stringify({
				active: { pluginName: 'test', stage: 'bootstrap', startedAt: Date.now() },
				configs: { secret: 'do-not-log' }
			})
		)
		const result = await run(`createPluginStartupWatchdog(${JSON.stringify(state)}, 100); while (true) {}`)
		expect(result.signal).toBe('SIGKILL')
		expect(result.stderr).toContain('runtime.startup.timeout')
		expect(result.stderr).toContain('bootstrap')
		expect(result.stderr).not.toContain('do-not-log')
	})
	it('cancels the watchdog once the application is admitted', async () => {
		const result = await run(
			`const watchdog = createPluginStartupWatchdog('unused', 100); watchdog.postMessage('ready'); setTimeout(() => process.exit(0), 250)`
		)
		expect(result.code).toBe(0)
		expect(result.signal).toBeNull()
		expect(result.stderr).not.toContain('runtime.startup.timeout')
	})
})
