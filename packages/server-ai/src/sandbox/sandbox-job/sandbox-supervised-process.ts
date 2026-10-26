// Reuses the phase 3.2 supervisor: only its descendant receipt confirms physical exit.
import { spawn } from 'node:child_process'
import { AGENT_PROCESS_SUPERVISOR } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const Receipt = z
    .object({
        version: z.literal(1),
        state: z.enum(['exited', 'not_started']),
        coverage: z.literal('descendants'),
        exitCode: z.number().int().nullable()
    })
    .strict()
export type ProcessExitReceipt = z.infer<typeof Receipt>

/** No signal is ever sent after the supervisor exits; a live leader reserves its process group. */
export function supervisedProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    const child = spawn('python3', ['-u', '-c', AGENT_PROCESS_SUPERVISOR, String(process.pid), command, ...args], {
        cwd,
        env,
        shell: false,
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe', 'pipe']
    })
    let receipt = '',
        exited = false,
        ready = false,
        stopRequested = false,
        timer: NodeJS.Timeout | undefined
    child.stdio[3]?.on('data', (data: Buffer) => {
        if (receipt.length < 4096) receipt += data.toString('utf8')
        if (!ready && receipt.startsWith('{"ready":true}\n')) {
            ready = true
            if (stopRequested && !exited) kill('SIGTERM')
        }
    })
    child.once('exit', () => {
        exited = true
        clearTimeout(timer)
    })
    const kill = child.kill.bind(child)
    const stop = () => {
        if (exited || timer) return false
        stopRequested = true
        if (ready) kill('SIGTERM')
        timer = setTimeout(() => {
            if (!exited && child.pid) {
                try {
                    process.kill(-child.pid, 'SIGKILL')
                } catch {}
            }
        }, 5000)
        timer.unref()
        return true
    }
    // SDK force-kill requests still go through the owned supervisor, never just its parent PID.
    child.kill = stop
    const finished = new Promise<ProcessExitReceipt | undefined>((resolve) => {
        child.once('close', (code) => {
            exited = true
            clearTimeout(timer)
            try {
                resolve(code === 0 ? Receipt.parse(JSON.parse(receipt.split('\n').at(-1) ?? '')) : undefined)
            } catch {
                resolve(undefined)
            }
        })
    })
    return { child, stop, finished }
}
