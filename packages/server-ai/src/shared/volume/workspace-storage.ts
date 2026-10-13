// Application state uses the Assistant volume's boundary and shared POSIX filesystem.
// Atomic replacement prevents partial reads; locks are independent of removable data folders.
import { createHash } from 'node:crypto'
import { readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { t } from 'i18next'
import { isPluginArtifactNamespace, type WorkspaceStorage } from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from './volume'
import { isManagedWorkspacePath } from './workspace-managed-path'
import { assertWorkspaceLeases, assertWorkspaceLeaseValidity, withWorkspaceLock } from './workspace-storage-lock'

function invalidPath() {
    return Object.assign(
        new Error(
            t('server-ai:Error.WorkspaceStorageInvalidPath', {
                defaultValue: 'The application storage path is invalid.'
            })
        ),
        { code: 'EINVAL' }
    )
}

function relativePath(value: string, allowEmpty = false) {
    if (
        typeof value !== 'string' ||
        (!value && !allowEmpty) ||
        value.includes('\\') ||
        value.includes('\0') ||
        path.posix.isAbsolute(value) ||
        (value &&
            value.split('/').some((part) => !part || part === '..' || part === '.' || part.toLowerCase() === '.locks'))
    ) {
        throw invalidPath()
    }
    return value
}

/** Kept separate from DI so real filesystem and independent-process tests exercise the same implementation. */
export class VolumeWorkspaceStorage implements WorkspaceStorage {
    private boundNamespace?: string
    private boundVolumeRoot?: string

    constructor(
        private readonly authorize: (operation: 'read' | 'write' | 'delete') => Promise<VolumeHandle>,
        private readonly namespace: string | (() => Promise<string>)
    ) {
        if (typeof namespace === 'string' && !isPluginArtifactNamespace(namespace)) throw invalidPath()
    }

    private async root(operation: 'read' | 'write' | 'delete' = 'write') {
        await assertWorkspaceLeases()
        const volume = await this.authorize(operation)
        // Pin before any provisioning so a policy change cannot write under an old volume's lock.
        const volumeRoot = path.resolve(volume.serverRoot)
        if (this.boundVolumeRoot && this.boundVolumeRoot !== volumeRoot) throw invalidPath()
        this.boundVolumeRoot = volumeRoot
        await volume.ensureRoot()
        const namespace = typeof this.namespace === 'string' ? this.namespace : await this.namespace()
        if (!isPluginArtifactNamespace(namespace) || (this.boundNamespace && this.boundNamespace !== namespace))
            throw invalidPath()
        this.boundNamespace = namespace
        const relative = `.apps/${namespace}`
        await VolumeHandle.ensureDirectory(volume.serverRoot, relative, volume.serverRoot, true)
        const root = path.join(await realpath(volume.serverRoot), relative)
        if ((await VolumeHandle.resolveExistingPath(volume.serverRoot, relative)) !== root) {
            throw invalidPath()
        }
        return root
    }

    private async openPath(root: string, relative: string) {
        const file = await VolumeHandle.openExistingFile(root, relative, { boundaryRoot: root })
        if (file.filePath !== path.join(root, relative)) {
            await file.fileHandle.close()
            throw invalidPath()
        }
        return file
    }

    async read(relative: string) {
        relativePath(relative)
        const root = await this.root('read')
        const file = await VolumeHandle.openFileSnapshot(root, relative, { boundaryRoot: root })
        try {
            if (file.filePath !== path.join(root, relative)) throw invalidPath()
            return await file.fileHandle.readFile()
        } finally {
            await file.fileHandle.close()
        }
    }

    async mkdir(relative: string) {
        relativePath(relative, true)
        const root = await this.root()
        await VolumeHandle.ensureDirectory(root, relative, root, true, assertWorkspaceLeaseValidity)
        const dir = await this.openPath(root, relative)
        await dir.fileHandle.close()
    }

    async list(relative: string) {
        relativePath(relative, true)
        const dir = await this.openPath(await this.root('read'), relative)
        try {
            if (!dir.fileStat.isDirectory()) throw invalidPath()
            return (await readdir(dir.descriptorPath)).filter(
                (name) => name !== '.locks' && !isManagedWorkspacePath(name)
            )
        } finally {
            await dir.fileHandle.close()
        }
    }

    async write(relative: string, content: string | Uint8Array) {
        relativePath(relative)
        const root = await this.root()
        const parent = path.posix.dirname(relative)
        await VolumeHandle.ensureDirectory(root, parent === '.' ? '' : parent, root, true)
        await VolumeHandle.writeFile(root, relative, content, { boundaryRoot: root })
    }

    async remove(relative: string) {
        relativePath(relative)
        const root = await this.root('delete')
        try {
            const entry = await this.openPath(root, relative)
            await entry.fileHandle.close()
            await VolumeHandle.removePath(root, relative, { boundaryRoot: root })
        } catch (error) {
            if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
        }
    }

    async withLock<T>(key: string, action: () => Promise<T>, options?: { waitMs?: number }): Promise<T> {
        relativePath(key)
        const root = await this.root()
        const lockPath = `.locks/${createHash('sha256').update(key).digest('hex')}`
        await VolumeHandle.ensureDirectory(root, lockPath, root, true)
        const dir = await this.openPath(root, lockPath)
        const requestedWait = options?.waitMs ?? 10_000
        if (!Number.isFinite(requestedWait)) {
            await dir.fileHandle.close()
            throw invalidPath()
        }
        const waitMs = Math.max(0, Math.min(180_000, requestedWait))
        try {
            return await withWorkspaceLock(
                dir.filePath,
                async () => {
                    await this.root() // Access may have been revoked while waiting for another instance.
                    return action()
                },
                waitMs
            )
        } finally {
            await dir.fileHandle.close()
        }
    }
}
