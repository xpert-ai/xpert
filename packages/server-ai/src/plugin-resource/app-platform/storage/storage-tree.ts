import { constants } from 'node:fs'
import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

export function storageContains(root: string, target: string) {
    const relative = path.relative(root, target)
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

/** Resolve existing ancestors as well as a not-yet-created leaf. */
export async function canonicalStoragePath(file: string): Promise<string> {
    try {
        return await realpath(file)
    } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
        const parent = path.dirname(file)
        if (parent === file) throw error
        return path.join(await canonicalStoragePath(parent), path.basename(file))
    }
}

/** Count durable regular-file bytes once; never traverse a link into another resource. */
export async function measureStorageTrees(roots: readonly string[]): Promise<number> {
    const seen = new Set<string>()
    let bytes = 0
    async function visit(file: string) {
        const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
            return null
        })
        if (!stat || stat.isSymbolicLink()) return
        const identity = `${stat.dev}:${stat.ino}`
        if (seen.has(identity)) return
        seen.add(identity)
        if (stat.isFile()) {
            bytes += stat.size
            if (!Number.isSafeInteger(bytes)) throw new Error('Storage size exceeds supported range')
        } else if (stat.isDirectory()) {
            const directory = await open(file, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
            try {
                const opened = await directory.stat()
                if (opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('Storage directory changed')
                // Linux descriptor paths retain the validated parent across rename races.
                const anchored = process.platform === 'linux' ? `/proc/self/fd/${directory.fd}` : file
                for (const entry of await readdir(anchored)) await visit(path.join(anchored, entry))
            } finally {
                await directory.close()
            }
        }
    }
    for (const root of roots) await visit(root)
    return bytes
}

export async function storedFileBytes(file: string) {
    const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
        return null
    })
    if (stat && (!stat.isFile() || stat.nlink !== 1)) throw new Error('Invalid storage write target')
    return stat?.size ?? 0
}
