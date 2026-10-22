// Invariants: only a successful filesystem heartbeat renews a lease. Keep its inode
// open so a stale owner cannot renew or release a replacement owner's lock.
// Check both elapsed and wall time: clock changes must never extend ownership.
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import { type FileHandle, lstat, open } from 'node:fs/promises'
import { t } from 'i18next'
import lockfile from 'proper-lockfile'

const stale = 120_000
const leases = new AsyncLocalStorage<WorkspaceLease[]>()
const elapsed = () => Number(process.hrtime.bigint() / 1_000_000n)

function lostLock() {
    return Object.assign(
        new Error(
            t('server-ai:Error.WorkspaceStorageLockLost', {
                defaultValue: 'The application storage lock was lost. Retry the operation.'
            })
        ),
        { code: 'ELOCKLOST' }
    )
}

class WorkspaceLease {
    lost = false
    active = true
    private acquired = false
    private created = false
    private expiresAt = Date.now() + stale
    private elapsedExpiry = elapsed() + stale
    private handle?: FileHandle
    private identity?: fs.Stats

    constructor(private readonly lockPath: string) {}

    private expired() {
        return Date.now() >= this.expiresAt || elapsed() >= this.elapsedExpiry
    }

    assertValid() {
        if (!this.active || this.lost || this.expired()) {
            this.lost = true
            throw lostLock()
        }
    }

    private sameOwner(stat: fs.Stats | null) {
        return Boolean(stat?.isDirectory() && stat.dev === this.identity?.dev && stat.ino === this.identity?.ino)
    }

    async assertOwned() {
        this.assertValid()
        try {
            if (!this.sameOwner(await lstat(this.lockPath))) throw lostLock()
            this.assertValid()
        } catch {
            this.lost = true
            throw lostLock()
        }
    }

    async bind() {
        this.acquired = true
        this.assertValid()
        this.handle = await open(
            this.lockPath,
            fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
        )
        const identity = await this.handle.stat()
        if (this.identity && !this.sameOwner(identity)) throw lostLock()
        this.identity = identity
        await this.assertOwned()
    }

    async canRelease() {
        if (this.expired() || !this.identity) return false
        return this.sameOwner(await lstat(this.lockPath).catch(() => null))
    }

    filesystem() {
        return {
            ...fs,
            mkdir: (file: fs.PathLike, callback: (error: NodeJS.ErrnoException | null) => void) =>
                fs.mkdir(file, (error) => {
                    if (!error) this.created = true
                    callback(error)
                }),
            stat: (file: fs.PathLike, callback: (error: NodeJS.ErrnoException | null, stat?: fs.Stats) => void) =>
                fs.lstat(file, (error, stat) => {
                    if (!error && this.created && !this.identity) this.identity = stat
                    if (!error && this.created && this.identity && !this.sameOwner(stat)) {
                        this.lost = true
                        return callback(Object.assign(lostLock(), { code: 'ENOENT' }))
                    }
                    callback(error, stat)
                }),
            utimes: (
                file: fs.PathLike,
                atime: fs.TimeLike,
                mtime: fs.TimeLike,
                callback: (error: NodeJS.ErrnoException | null) => void
            ) => {
                const startedAt = Date.now()
                const startedElapsed = elapsed()
                if (this.acquired && (!this.active || this.lost || this.expired())) {
                    this.lost = true
                    callback(Object.assign(lostLock(), { code: 'ENOENT' }))
                    return
                }
                const done = (error: NodeJS.ErrnoException | null) => {
                    if (!error) {
                        // An I/O callback arriving after expiry cannot resurrect this lease.
                        if (this.acquired && this.expired()) this.lost = true
                        this.expiresAt = startedAt + stale
                        this.elapsedExpiry = startedElapsed + stale
                    }
                    callback(error)
                }
                if (this.handle) this.handle.utimes(atime, mtime).then(() => done(null), done)
                else fs.utimes(file, atime, mtime, done)
            },
            rmdir: (file: fs.PathLike, callback: (error: NodeJS.ErrnoException | null) => void) => {
                if (!this.identity) return fs.rmdir(file, callback)
                // proper-lockfile also invokes this after compromise; never unlink a new owner's directory.
                fs.lstat(file, (error, stat) => {
                    if (error || this.expired() || !this.sameOwner(stat)) return callback(null)
                    fs.rmdir(file, callback)
                })
            },
            rmdirSync: (file: fs.PathLike) => {
                if (!this.identity || (!this.expired() && this.sameOwner(fs.lstatSync(file)))) fs.rmdirSync(file)
            }
        }
    }

    close() {
        this.active = false
        return this.handle?.close()
    }
}

export function assertWorkspaceLeaseValidity() {
    for (const lease of leases.getStore() ?? []) lease.assertValid()
}

export async function assertWorkspaceLeases() {
    for (const lease of leases.getStore() ?? []) await lease.assertOwned()
    assertWorkspaceLeaseValidity()
}

/** Host-only boundary for independent tasks; preserve every other async context.
 * A stale caller must not escape fencing by dispatching new work. */
export async function runWithIndependentWorkspaceLeases<T>(action: () => Promise<T>): Promise<T> {
    await assertWorkspaceLeases()
    return leases.run([], action)
}

export async function withWorkspaceLock<T>(file: string, action: () => Promise<T>, waitMs: number): Promise<T> {
    await assertWorkspaceLeases()
    const lease = new WorkspaceLease(`${file}.lock`)
    const release = await lockfile.lock(file, {
        realpath: false,
        stale,
        update: 10_000,
        fs: lease.filesystem(),
        retries: { retries: Math.ceil(waitMs / 100), factor: 1, minTimeout: 100, maxTimeout: 100 },
        onCompromised: () => {
            lease.lost = true
        }
    })
    try {
        await lease.bind()
        return await leases.run([...(leases.getStore() ?? []), lease], async () => {
            await assertWorkspaceLeases()
            const result = await action()
            await assertWorkspaceLeases()
            return result
        })
    } finally {
        lease.active = false
        try {
            // proper-lockfile indexes owners by path in-process. Releasing an old owner
            // after takeover would cancel the new owner's heartbeat even if rmdir is guarded.
            if (await lease.canRelease()) {
                await release().catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ERELEASED' && error.code !== 'ENOTACQUIRED') throw error
                })
            }
        } finally {
            await lease.close()
        }
    }
}
