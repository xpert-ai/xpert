// Invariants: journal the intended hash before publishing a file. A restart may
// accept either the last committed hash or the pending hash, never arbitrary bytes.
import { t } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { z } from 'zod'
import { assertWorkspaceLeases, withWorkspaceLock } from '../../shared/volume/workspace-storage-lock'
import { isFileNotFoundError } from '../utils/template-files'

export const syncManifestName = '.builtin-template-sync.json'
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const entrySchema = z.object({ hash: digest.nullable().optional(), pending: digest.optional() }).strict()
const manifestSchema = z
    .object({
        version: z.literal(1),
        catalogInitialized: z.boolean(),
        files: z.record(entrySchema),
        catalog: z.record(entrySchema)
    })
    .strict()
export type SyncEntry = z.infer<typeof entrySchema>
export type SyncManifest = z.infer<typeof manifestSchema>
export type SyncResult = {
    added: string[]
    updated: string[]
    adopted: string[]
    preserved: string[]
    conflicted: string[]
}
export const hashContent = (content: string | Buffer) => createHash('sha256').update(content).digest('hex')

export async function withTemplateSyncLock<T>(root: string, action: (root: string) => Promise<T>): Promise<T> {
    const canonicalRoot = await fs.realpath(root)
    return withWorkspaceLock(join(canonicalRoot, '.builtin-template-sync'), () => action(canonicalRoot), 30_000)
}

export async function assertTemplatePath(root: string, file: string) {
    const parts = relative(root, file).split(sep)
    if (parts.includes('..')) throw new Error(t('server-ai:Error.UnsafeTemplateSyncPath', { file }))
    let current = root
    for (const part of parts) {
        current = join(current, part)
        try {
            const stat = await fs.lstat(current)
            if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
                throw new Error(t('server-ai:Error.UnsafeTemplateSyncPath', { file: current }))
            }
        } catch (error) {
            if (!isFileNotFoundError(error)) throw error
        }
    }
}

export async function readOptionalFile(file: string): Promise<Buffer | undefined> {
    try {
        return await fs.readFile(file)
    } catch (error) {
        if (isFileNotFoundError(error)) return undefined
        throw error
    }
}

export async function atomicTemplateWrite(
    root: string,
    file: string,
    content: string | Buffer,
    expectedHash?: string | null
) {
    await assertTemplatePath(root, file)
    await fs.mkdir(dirname(file), { recursive: true })
    const mode = await fs.stat(file).then(
        (stat) => stat.mode,
        (error: unknown) => {
            if (isFileNotFoundError(error)) return 0o644
            throw error
        }
    )
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
        const handle = await fs.open(temporary, 'wx', mode)
        try {
            await handle.writeFile(content)
            await handle.sync()
        } finally {
            await handle.close()
        }
        await assertTemplatePath(root, file)
        if (expectedHash !== undefined) {
            const current = await readOptionalFile(file)
            if ((current === undefined ? null : hashContent(current)) !== expectedHash) {
                throw new Error(t('server-ai:Error.TemplateSyncConcurrentChange', { file }))
            }
        }
        await assertWorkspaceLeases()
        await fs.rename(temporary, file)
        const directory = await fs.open(dirname(file), 'r')
        try {
            await directory.sync()
        } finally {
            await directory.close()
        }
    } finally {
        await fs.rm(temporary, { force: true })
    }
}

export async function readSyncManifest(root: string): Promise<SyncManifest | undefined> {
    const file = join(root, syncManifestName)
    await assertTemplatePath(root, file)
    const content = await readOptionalFile(file)
    if (!content) return undefined
    try {
        return manifestSchema.parse(JSON.parse(content.toString('utf8')))
    } catch {
        throw new Error(t('server-ai:Error.InvalidTemplateSyncManifest', { file }))
    }
}

export async function saveSyncManifest(root: string, manifest: SyncManifest) {
    await atomicTemplateWrite(root, join(root, syncManifestName), JSON.stringify(manifest, null, 2) + '\n')
}

/** Missing catalog entries can be intentional removals; missing files retain the existing reseed behavior. */
export function planSync(
    entries: Record<string, SyncEntry>,
    key: string,
    current: string | undefined,
    builtin: string,
    result: SyncResult,
    label: string,
    preserveMissing: boolean
): boolean {
    const previous = entries[key]
    const entry = previous ?? {}
    entries[key] = entry
    const interruptedCreation = entry.pending !== undefined && entry.hash === undefined && current === undefined
    if (entry.pending === current && current !== undefined) entry.hash = current
    delete entry.pending
    if (current === builtin) {
        result[entry.hash === builtin ? 'preserved' : 'adopted'].push(label)
        entry.hash = builtin
        return false
    }
    if (current === undefined && preserveMissing && !interruptedCreation) {
        if (!previous) entry.hash = null
        result.conflicted.push(label)
        return false
    }
    if (current === undefined || current === entry.hash) {
        entry.pending = builtin
        result[current === undefined ? 'added' : 'updated'].push(label)
        return true
    }
    result.conflicted.push(label)
    return false
}
