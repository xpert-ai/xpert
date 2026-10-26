// npm runs outside the API event loop. On cancellation kill its process group
// before callers remove staging files; never publish a timed-out installation.
import { spawn } from 'node:child_process'
import { t } from 'i18next'

// This watchdog survives an abruptly killed API parent. Its whole process group
// (including npm lifecycle children) has a finite lifetime even without the API timer.
const INSTALL_WATCHDOG = `
const { spawn } = require('node:child_process');
const child = spawn(process.argv[1], process.argv.slice(3), { stdio: 'inherit' });
const timer = setTimeout(() => {
  if (process.platform !== 'win32') process.kill(-process.pid, 'SIGKILL');
  else { child.kill('SIGKILL'); process.exit(1); }
}, Number(process.argv[2]));
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('close', code => { clearTimeout(timer); process.exit(code === null ? 1 : code); });
`

export async function runInstallProcess(
	command: string,
	args: string[],
	options: { cwd: string; timeoutMs: number; signal: AbortSignal }
): Promise<void> {
	options.signal.throwIfAborted()
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, ['-e', INSTALL_WATCHDOG, command, String(options.timeoutMs), ...args], {
			cwd: options.cwd,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true
		})
		let failure: Error | undefined
		let output = ''
		const capture = (chunk: Buffer) => {
			output = (output + chunk.toString()).slice(-8192)
		}
		child.stdout.on('data', capture)
		child.stderr.on('data', capture)
		const stop = (error: Error) => {
			failure ??= error
			if (!child.pid) return
			try {
				if (process.platform === 'win32') child.kill('SIGKILL')
				else process.kill(-child.pid, 'SIGKILL')
			} catch (error) {
				if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH'))
					child.kill('SIGKILL')
			}
		}
		const abort = () =>
			stop(
				new Error(
					t('server-ai:Error.PluginInstallationCancelled', {
						defaultValue: 'Plugin installation was cancelled because storage ownership was lost.'
					})
				)
			)
		options.signal.addEventListener('abort', abort, { once: true })
		const onExit = () => stop(new Error('API process exited'))
		process.once('exit', onExit)
		const timer = setTimeout(
			() =>
				stop(
					new Error(
						t('server-ai:Error.PluginInstallationTimeout', {
							defaultValue: 'Plugin installation exceeded its time limit.'
						})
					)
				),
			options.timeoutMs
		)
		child.once('error', (error) => {
			failure ??= error
		})
		child.once('close', (code) => {
			clearTimeout(timer)
			process.removeListener('exit', onExit)
			options.signal.removeEventListener('abort', abort)
			if (failure) reject(failure)
			else if (code !== 0)
				reject(
					new Error(
						t('server-ai:Error.PluginInstallationFailed', {
							defaultValue: 'Plugin installation failed (exit {{code}}): {{details}}',
							code,
							details: output.trim()
						})
					)
				)
			else resolve()
		})
		if (options.signal.aborted) abort()
	})
}
