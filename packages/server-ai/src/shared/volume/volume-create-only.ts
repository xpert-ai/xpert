// Publish a complete generation without replacing a concurrent writer. Recover a temp hard link
// left by a process crash only when it is a reserved sibling with the exact same device/inode.
import { link, lstat, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { t } from 'i18next'

export async function existingCreateOnlyTarget(target: string) {
    let existing = await lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
    })
    if (!existing) return null
    if (existing.isFile() && existing.nlink > 1) {
        for (const name of await readdir(path.dirname(target))) {
            if (!/^\.workspace-write-[0-9a-f-]+\.tmp$/.test(name)) continue
            const candidate = path.join(path.dirname(target), name)
            const stat = await lstat(candidate).catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return null
                throw error
            })
            if (stat?.isFile() && stat.dev === existing.dev && stat.ino === existing.ino)
                await unlink(candidate).catch((error: NodeJS.ErrnoException) => {
                    if (error.code !== 'ENOENT') throw error
                })
        }
        existing = await lstat(target)
    }
    if (!existing.isFile() || existing.nlink !== 1) throw new Error(t('server-ai:Error.WorkspaceAtomicTargetInvalid'))
    return existing
}

export async function publishCreateOnlyFile(temporary: string, target: string): Promise<boolean> {
    try {
        await link(temporary, target)
        return true
    } catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error
        await existingCreateOnlyTarget(target)
        return false
    }
}
