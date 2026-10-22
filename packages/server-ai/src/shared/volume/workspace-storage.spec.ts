import { mkdtemp, rm, mkdir, readFile, writeFile, symlink, link, rename, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import lockfile from 'proper-lockfile'
import { VolumeHandle } from './volume'
import { VolumeWorkspaceStorage } from './workspace-storage'
import { runWithIndependentWorkspaceLeases } from './workspace-storage-lock'

describe('Workspace application filesystem', () => {
    let root: string
    let storage: VolumeWorkspaceStorage
    const scope = { tenantId: 'tenant', catalog: 'user-xperts' as const, userId: 'alice', xpertId: 'assistant' }
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'workspace-state-'))
        const volume = new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
        storage = new VolumeWorkspaceStorage(async () => volume, 'meetings')
    })
    afterEach(async () => {
        jest.useRealTimers()
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })

    it('atomically replaces complete records while other instances read', async () => {
        const content = 'x'.repeat(100_000)
        await storage.write('record.json', JSON.stringify({ revision: 0, content }))
        const reader = new VolumeWorkspaceStorage(
            async () => new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root),
            'meetings'
        )
        await Promise.all([
            (async () => {
                for (let i = 1; i <= 20; i++)
                    await storage.write('record.json', JSON.stringify({ revision: i, content }))
            })(),
            (async () => {
                for (let i = 0; i < 40; i++)
                    expect(JSON.parse((await reader.read('record.json')).toString()).content).toBe(content)
            })()
        ])
        expect(JSON.parse((await reader.read('record.json')).toString()).revision).toBe(20)
        expect(await storage.list('')).toEqual(['record.json'])
    })

    it.each([
        '../outside',
        'a/../../outside',
        '/absolute',
        'a\\outside',
        'a\0b',
        '.',
        '.locks/target',
        'a//b',
        'a/',
        '.LOCKS/target'
    ])('rejects invalid path %s before accessing files', async (file) => {
        await expect(storage.read(file)).rejects.toThrow()
        await expect(storage.write(file, 'bad')).rejects.toThrow()
        await expect(storage.remove(file)).rejects.toThrow()
        await expect(storage.withLock(file, async () => {})).rejects.toThrow()
    })

    it('rejects symlink escapes and hardlinked reads; atomic replacement never overwrites their targets', async () => {
        await storage.mkdir('records')
        const outside = path.join(root, 'outside')
        await mkdir(outside)
        await writeFile(path.join(outside, 'secret'), 'untouched')
        const appRoot = path.join(root, 'workspace/.apps/meetings')
        await symlink(outside, path.join(appRoot, 'escape'))
        await expect(storage.read('escape/secret')).rejects.toThrow()
        await expect(storage.write('escape/secret', 'changed')).rejects.toThrow()
        await expect(storage.remove('escape/secret')).rejects.toThrow()
        await link(path.join(outside, 'secret'), path.join(appRoot, 'hardlink'))
        await expect(storage.read('hardlink')).rejects.toThrow()
        await expect(storage.write('hardlink', 'own copy')).rejects.toThrow()
        expect(await readFile(path.join(outside, 'secret'), 'utf8')).toBe('untouched')
        await symlink(path.join(outside, 'secret'), path.join(appRoot, 'final-symlink'))
        await expect(storage.write('final-symlink', 'own replacement')).rejects.toThrow()
        expect(await readFile(path.join(outside, 'secret'), 'utf8')).toBe('untouched')
    })

    it('serializes updates across separate storage objects and releases locks on failure', async () => {
        const volume = new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
        const second = new VolumeWorkspaceStorage(async () => volume, 'meetings')
        await storage.write('counter', '0')
        await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
                (i % 2 ? second : storage).withLock('counter', async () => {
                    const n = Number((await storage.read('counter')).toString())
                    await new Promise((resolve) => setTimeout(resolve, 5))
                    await storage.write('counter', String(n + 1))
                })
            )
        )
        expect((await second.read('counter')).toString()).toBe('12')
        await expect(
            storage.withLock('counter', async () => {
                throw new Error('worker failed')
            })
        ).rejects.toThrow('worker failed')
        await second.withLock('counter', async () => {
            await second.write('counter', '13')
        })
        expect((await storage.read('counter')).toString()).toBe('13')
    })

    it('does not remove the active processing lock when deleting a meeting folder', async () => {
        await storage.write('records/meeting/audio.wav', 'audio')
        await storage.withLock('records/meeting/processing', async () => {
            await storage.remove('records/meeting')
            await expect(
                storage.withLock('records/meeting/processing', async () => {}, { waitMs: 0 })
            ).rejects.toMatchObject({ code: 'ELOCKED' })
        })
        await storage.withLock('records/meeting/processing', async () => {})
    })

    it('shares durable state and serializes read-modify-write in independent Node processes', async () => {
        await storage.write('counter', '0')
        const run = () =>
            new Promise<void>((resolve, reject) => {
                const child = spawn(
                    process.execPath,
                    [path.join(__dirname, 'fixtures/workspace-storage-worker.cjs'), root],
                    {
                        cwd: path.resolve(__dirname, '../../../../..'),
                        env: {
                            ...process.env,
                            TS_NODE_PROJECT: path.resolve(__dirname, '../../../tsconfig.spec.json')
                        },
                        stdio: ['ignore', 'ignore', 'pipe']
                    }
                )
                let errors = ''
                child.stderr.on('data', (chunk) => {
                    errors += chunk.toString()
                })
                child.once('error', reject)
                child.once('close', (code) =>
                    code === 0 ? resolve() : reject(new Error(errors || `Worker exited ${code}`))
                )
            })
        await Promise.all([run(), run()])
        expect((await storage.read('counter')).toString()).toBe('16')
    }, 60_000)

    it('fails subsequent writes closed when lock ownership is lost', async () => {
        let compromise: () => void = () => {}
        const lock = lockfile.lock
        const spy = jest.spyOn(lockfile, 'lock').mockImplementation(async (_path, options) => {
            compromise = () => options.onCompromised(new Error('lost'))
            return lock(_path, options)
        })
        try {
            await storage.write('record', 'before')
            await expect(
                storage.withLock('record', async () => {
                    compromise()
                    await storage.write('record', 'stale writer')
                })
            ).rejects.toMatchObject({ code: 'ELOCKLOST' })
            expect((await storage.read('record')).toString()).toBe('before')
        } finally {
            spy.mockRestore()
        }
    })

    it('rejects detached work that outlives its lock callback', async () => {
        await storage.write('record', 'before')
        let continueWrite: () => void = () => {}
        let detached: Promise<void> = Promise.resolve()
        const released = new Promise<void>((resolve) => {
            continueWrite = resolve
        })
        await storage.withLock('record', async () => {
            detached = released.then(() => storage.write('record', 'after release'))
        })
        const rejected = expect(detached).rejects.toMatchObject({ code: 'ELOCKLOST' })
        continueWrite()
        await rejected
        expect((await storage.read('record')).toString()).toBe('before')
    })

    it('does not allow a stale caller to escape fencing through independent dispatch', async () => {
        let resume: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
            resume = resolve
        })
        const start = jest.fn(async () => {})
        let background: Promise<void> = Promise.resolve()
        await storage.withLock('record', async () => {
            background = gate.then(() => runWithIndependentWorkspaceLeases(start))
        })
        const rejected = expect(background).rejects.toMatchObject({ code: 'ELOCKLOST' })
        resume()
        await rejected
        expect(start).not.toHaveBeenCalled()
    })

    it('does not retarget an existing handle after the authorized workspace changes', async () => {
        let volume = new VolumeHandle(scope, path.join(root, 'first'), '', '', root)
        const bound = new VolumeWorkspaceStorage(async () => volume, 'meetings')
        await bound.write('record', 'private')
        await expect(
            bound.withLock('record', async () => {
                volume = new VolumeHandle(scope, path.join(root, 'second'), '', '', root)
                await bound.write('record', 'copied under the wrong lock')
            })
        ).rejects.toMatchObject({ code: 'EINVAL' })
        await expect(readFile(path.join(root, 'second/.apps/meetings/record'))).rejects.toMatchObject({
            code: 'ENOENT'
        })
    })

    it('does not renew a lease when the filesystem heartbeat stops succeeding', async () => {
        await storage.write('record', 'before')
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        await expect(
            storage.withLock('record', async () => {
                jest.advanceTimersByTime(120_001)
                await storage.write('record', 'stale writer')
            })
        ).rejects.toMatchObject({ code: 'ELOCKLOST' })
        jest.useRealTimers()
        expect((await storage.read('record')).toString()).toBe('before')
    })

    it('detects a replaced lock before writing and never releases the replacement owner', async () => {
        await storage.write('record', 'before')
        const locks = path.join(root, 'workspace/.apps/meetings/.locks')
        let replacement = ''
        await expect(
            storage.withLock('record', async () => {
                const name = (await readdir(locks)).find((name) => name.endsWith('.lock'))!
                replacement = path.join(locks, name)
                await rename(replacement, `${replacement}.old`)
                await mkdir(replacement)
                await storage.write('record', 'stale writer')
            })
        ).rejects.toMatchObject({ code: 'ELOCKLOST' })
        expect((await storage.read('record')).toString()).toBe('before')
        expect(await readdir(replacement)).toEqual([])
    })

    it('rechecks authorization after acquiring a lock before starting the callback', async () => {
        let allowed = true
        const volume = new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
        const bound = new VolumeWorkspaceStorage(async () => {
            if (!allowed) throw new Error('access revoked')
            return volume
        }, 'meetings')
        const lock = lockfile.lock
        jest.spyOn(lockfile, 'lock').mockImplementation(async (file, options) => {
            const release = await lock(file, options)
            allowed = false
            return release
        })
        const action = jest.fn()
        await expect(bound.withLock('record', action)).rejects.toThrow('access revoked')
        expect(action).not.toHaveBeenCalled()
    })

    it('keeps the new in-process owner registered when an old callback finishes after takeover', async () => {
        let acquired: () => void = () => {}
        let resume: () => void = () => {}
        const ready = new Promise<void>((resolve) => {
            acquired = resolve
        })
        const proceed = new Promise<void>((resolve) => {
            resume = resolve
        })
        const first = storage.withLock('record', async () => {
            acquired()
            await proceed
            await storage.write('record', 'stale')
        })
        const rejected = expect(first).rejects.toMatchObject({ code: 'ELOCKLOST' })
        await ready
        const locks = path.join(root, 'workspace/.apps/meetings/.locks')
        const name = (await readdir(locks)).find((name) => name.endsWith('.lock'))!
        await rename(path.join(locks, name), path.join(locks, `${name}.old`))
        await storage.withLock('record', async () => {
            resume()
            await rejected
            await storage.write('record', 'new owner')
        })
        await storage.withLock('record', async () => {}, { waitMs: 0 })
        expect((await storage.read('record')).toString()).toBe('new owner')
    })

    it('rechecks the lease at deletion, after asynchronous path resolution', async () => {
        await storage.write('record', 'before')
        let compromise: () => void = () => {}
        const lock = lockfile.lock
        jest.spyOn(lockfile, 'lock').mockImplementation(async (file, options) => {
            compromise = () => options.onCompromised(new Error('lost'))
            return lock(file, options)
        })
        const remove = VolumeHandle.removePath
        jest.spyOn(VolumeHandle, 'removePath').mockImplementation(async (...args) => {
            compromise()
            return remove(...args)
        })
        await expect(storage.withLock('record', () => storage.remove('record'))).rejects.toMatchObject({
            code: 'ELOCKLOST'
        })
        expect((await storage.read('record')).toString()).toBe('before')
    })

    it('also fences ordinary workspace projections written inside a lost application lock', async () => {
        const volume = new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
        await volume.writeFile('meetings/notes.md', 'before')
        let compromise: () => void = () => {}
        const lock = lockfile.lock
        jest.spyOn(lockfile, 'lock').mockImplementation(async (file, options) => {
            compromise = () => options.onCompromised(new Error('lost'))
            return lock(file, options)
        })
        await expect(
            storage.withLock('record', async () => {
                await VolumeHandle.writeFile(volume.serverRoot, 'meetings/notes.md', 'stale projection', {
                    beforeCommit: compromise
                })
            })
        ).rejects.toMatchObject({ code: 'ELOCKLOST' })
        expect(await volume.readFile('meetings/notes.md')).toBe('before')
    })

    it('keeps long work alive through confirmed filesystem heartbeats', async () => {
        await storage.write('record', 'before')
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
        let onHeartbeat: (() => void) | undefined
        const lock = lockfile.lock
        jest.spyOn(lockfile, 'lock').mockImplementation((file, options) =>
            lock(file, {
                ...options,
                fs: {
                    ...options.fs,
                    utimes: (file, atime, mtime, callback) =>
                        options.fs.utimes(file, atime, mtime, (error) => {
                            callback(error)
                            onHeartbeat?.()
                        })
                }
            })
        )
        await storage.withLock('record', async () => {
            for (let i = 0; i < 13; i++) {
                const confirmed = new Promise<void>((resolve) => {
                    onHeartbeat = resolve
                })
                jest.advanceTimersByTime(10_000)
                await confirmed
            }
            await storage.write('record', 'after 130 seconds')
        })
        jest.useRealTimers()
        expect((await storage.read('record')).toString()).toBe('after 130 seconds')
    })
})
