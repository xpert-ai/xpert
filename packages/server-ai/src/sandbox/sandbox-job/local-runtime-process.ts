import { spawn } from 'node:child_process'
import { t } from 'i18next'
import type { SandboxRuntimeExecuteResponse } from '@xpert-ai/plugin-sdk'

// Health probes can launch Python/Java children. Terminate the whole probe group
// on deadline and wait for closed output streams before reporting the failure.
export type LocalRuntimeProcessResult = SandboxRuntimeExecuteResponse & { signal: NodeJS.Signals | null }

export async function runLocalRuntimeProcess(
    command: string,
    args: string[],
    options: { timeoutMs: number; maxOutputBytes: number; cwd: string; env: NodeJS.ProcessEnv }
): Promise<LocalRuntimeProcessResult> {
    return new Promise((resolve, reject) => {
        const processGroup = process.platform !== 'win32'
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            detached: processGroup,
            stdio: ['ignore', 'pipe', 'pipe']
        })
        let output = ''
        let truncated = false
        let timedOut = false
        const append = (chunk: Buffer | string) => {
            const next = `${output}${String(chunk)}`
            if (Buffer.byteLength(next) <= options.maxOutputBytes) output = next
            else {
                truncated = true
                output = Buffer.from(next).subarray(-options.maxOutputBytes).toString()
            }
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)
        const timeout = setTimeout(() => {
            timedOut = true
            if (processGroup && child.pid) {
                try {
                    process.kill(-child.pid, 'SIGKILL')
                    return
                } catch {
                    // The group may already have exited; still reap the direct child.
                }
            }
            child.kill('SIGKILL')
        }, options.timeoutMs)
        timeout.unref()
        child.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
        })
        child.once('close', (exitCode, signal) => {
            clearTimeout(timeout)
            resolve({ output: output.trim(), exitCode, signal, truncated, timedOut })
        })
    })
}

export function localRuntimeProbeFailure(result: LocalRuntimeProcessResult, timeoutMs: number): string {
    const reason = result.timedOut
        ? t('server-ai:Error.SandboxRuntimeHealthTimeout', {
              defaultValue:
                  'Runtime health check timed out after {{seconds}} seconds. Retry when the host is less busy.',
              seconds: timeoutMs / 1000
          })
        : result.signal
          ? t('server-ai:Error.SandboxRuntimeHealthSignal', {
                defaultValue: 'Runtime health check was terminated by signal {{signal}}.',
                signal: result.signal
            })
          : t('server-ai:Error.SandboxRuntimeHealthExit', {
                defaultValue: 'Runtime health check failed with exit code {{code}}.',
                code: result.exitCode ?? 'unknown'
            })
    return result.output ? `${reason} ${result.output}` : reason
}
