/** The watchdog runs outside the main event loop, including during synchronous plugin initialization. */
import { Worker } from 'node:worker_threads'

export function createPluginStartupWatchdog(file: string, timeoutMs: number): Worker {
	// A worker's timer still runs when plugin import/bootstrap blocks the main event loop.
	const watchdog = new Worker(
		`
		const { workerData, parentPort } = require('node:worker_threads');
		const { readFileSync, writeSync } = require('node:fs');
		const timer = setTimeout(() => {
			let active;
			try { active = JSON.parse(readFileSync(workerData.file, 'utf8')).active } catch {}
			writeSync(2, JSON.stringify({ event: 'runtime.startup.timeout', timeoutMs: workerData.timeoutMs, ...active }) + '\\n');
			process.kill(workerData.pid, 'SIGKILL');
		}, workerData.timeoutMs);
		parentPort.once('message', () => { clearTimeout(timer); parentPort.close(); });
	`,
		{ eval: true, workerData: { pid: process.pid, timeoutMs, file } }
	)
	watchdog.unref()
	return watchdog
}
