import { init } from 'i18next'
import { localRuntimeProbeFailure, runLocalRuntimeProcess } from './local-runtime-process'

const options = { timeoutMs: 15000, maxOutputBytes: 4096, cwd: process.cwd(), env: {} }

jest.setTimeout(20000)

beforeAll(async () => {
    await init({ lng: 'en', resources: {} })
})

it('drains stderr and retains the actual exit code', async () => {
    const result = await runLocalRuntimeProcess(
        process.execPath,
        ['-e', "require('node:fs').writeSync(2, 'invalid model'); process.exit(7)"],
        options
    )
    expect(result).toMatchObject({ output: 'invalid model', exitCode: 7, signal: null, timedOut: false })
    expect(localRuntimeProbeFailure(result, 5000)).toContain('exit code 7')
    expect(localRuntimeProbeFailure(result, 5000)).toContain('invalid model')
})

it('reports a signal instead of claiming the executable is missing', async () => {
    const result = await runLocalRuntimeProcess(
        process.execPath,
        ['-e', "process.kill(process.pid, 'SIGTERM')"],
        options
    )
    expect(result).toMatchObject({ exitCode: null, signal: 'SIGTERM', timedOut: false })
    expect(localRuntimeProbeFailure(result, 5000)).toContain('SIGTERM')
    expect(localRuntimeProbeFailure(result, 5000)).not.toContain('not installed')
})

it('terminates the probe and its child processes on deadline', async () => {
    const result = await runLocalRuntimeProcess(
        process.execPath,
        [
            '-e',
            `
        require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });
        setInterval(() => {}, 1000);
    `
        ],
        { ...options, timeoutMs: 2000 }
    )
    // close cannot fire while a surviving descendant holds the inherited output streams open.
    expect(result).toMatchObject({ timedOut: true, exitCode: null, signal: 'SIGKILL' })
    expect(localRuntimeProbeFailure(result, 2000)).toContain('timed out after 2 seconds')
    expect(localRuntimeProbeFailure(result, 2000)).not.toContain('not installed')
}, 10000)

it('preserves genuine executable-not-found errors', async () => {
    await expect(runLocalRuntimeProcess('/does-not-exist/xpert-health-test', [], options)).rejects.toMatchObject({
        code: 'ENOENT'
    })
})
