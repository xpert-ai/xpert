import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Safely execute a shell script string in Linux
 * @param script - The shell script content
 */
export function runScript(script: string, options?: {timeout?: number; safeEnv: boolean}): Promise<{ code: number; stdout: string; stderr: string; timedOut?: boolean }> {
	const { timeout = 0, safeEnv } = options || {}
	return new Promise((resolve, reject) => {

		// Generate a safe temporary file path
		const tmpFile = join(tmpdir(), `script-${randomBytes(8).toString('hex')}.sh`)
		let timer = null;
    	let killedByTimeout = false;

		try {
			// Write script to a temporary file
			writeFileSync(tmpFile, script, { mode: 0o700 })

			// Choose environment
			const env = safeEnv
				? { PATH: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" } // limited but covers brew/macOS
				: process.env;

			// Run the script using bash
			const child = spawn('/bin/bash', [tmpFile], {
				stdio: ['ignore', 'pipe', 'pipe'],
				env
			})

			let stdout = ''
			let stderr = ''

			child.stdout.on('data', (data) => {
				stdout += data.toString()
			})

			child.stderr.on('data', (data) => {
				stderr += data.toString()
			})

			// Handle timeout
			if (timeout > 0) {
				timer = setTimeout(() => {
					killedByTimeout = true;
					child.kill("SIGKILL");
				}, timeout);
			}

			child.on('close', (code) => {
				try {
					unlinkSync(tmpFile) // Clean up
				} catch {
                    //
                }
				if (timer) clearTimeout(timer);
				resolve({ code, stdout, stderr, timedOut: killedByTimeout })
			})

			child.on('error', (err) => {
				try {
					unlinkSync(tmpFile)
				} catch {
                    //
                }
				if (timer) clearTimeout(timer);
				reject(err)
			})
		} catch (err) {
			reject(err)
		}
	})
}
