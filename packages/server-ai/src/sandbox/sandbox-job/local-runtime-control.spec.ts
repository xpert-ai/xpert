import { randomUUID } from 'node:crypto'
import { LocalRuntimeControl } from './local-runtime-control'
import { LocalBrowserRuntimeInstance } from './local-browser-runtime-instance'

it('requires the original local host and generation before touching an instance', async () => {
    const terminate = jest.fn()
    const instances = new Map<string, { terminate(): void; exitProven: boolean; executionUnknown: boolean }>()
    const original = new LocalRuntimeControl('local', instances),
        replica = new LocalRuntimeControl('local', new Map())
    const target = await original.prepare({
        generation: randomUUID(),
        tenantId: 'test',
        workFor: { type: 'job', id: 'one' },
        runtimeProfile: 'test',
        runtimeBindingId: 'test',
        artifact: { kind: 'filesystem', reference: 'test' }
    })
    instances.set(target.runtimeRef, { terminate, exitProven: false, executionUnknown: false })
    expect((await replica.control(target, 'stop')).state).toBe('unknown')
    expect((await original.control({ ...target, generation: randomUUID() }, 'stop')).state).toBe('unknown')
    expect(terminate).not.toHaveBeenCalled()
    expect((await original.control(target, 'stop')).state).toBe('running')
    expect(terminate).toHaveBeenCalledTimes(1)
    instances.get(target.runtimeRef).exitProven = true
    expect((await original.control(target, 'inspect')).state).toBe('exited')
})

it('seals a cancelled local instance before its first execution and never reopens it', async () => {
    const instance = new LocalBrowserRuntimeInstance({
        id: 'test',
        workspaceRoot: '/tmp',
        runnerPath: '/tmp/runner.mjs',
        nodePath: process.execPath,
        environment: {},
        trustedCommand: ['node', 'runner'],
        hardDeadlineMs: 10000,
        controlled: true
    })
    instance.terminate()
    expect(instance.exitProven).toBe(true)
    await expect(instance.execute(['node', 'runner'])).rejects.toThrow('admission closed')
    await instance.dispose()
})
