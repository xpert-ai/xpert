// Synchronization owns only paths shipped by this image. Unknown legacy content
// and local overrides are preserved; removed upstream assets are never deleted.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { readBuiltinTemplateCatalog, upgradeBuiltinTemplateCatalog } from '../template-catalog-upgrade'
import { templateDirectories, templateFiles } from '../template.constants'
import { syncTemplateCatalog } from './template-catalog-sync'
import {
    assertTemplatePath,
    atomicTemplateWrite,
    hashContent,
    planSync,
    readOptionalFile,
    readSyncManifest,
    saveSyncManifest,
    SyncManifest,
    SyncResult,
    withTemplateSyncLock
} from './template-sync-state'

async function inventory(root: string, directory: string): Promise<string[]> {
    const files: string[] = []
    for (const entry of (await fs.readdir(join(root, directory), { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name)
    )) {
        const file = `${directory}/${entry.name}`
        await assertTemplatePath(root, join(root, file))
        if (entry.isDirectory()) files.push(...(await inventory(root, file)))
        else files.push(file)
    }
    return files
}

export async function syncBuiltinTemplates(builtinRoot: string, externalRoot: string): Promise<SyncResult> {
    return withTemplateSyncLock(externalRoot, async (root) => {
        const previous = await readSyncManifest(root)
        const manifest: SyncManifest = previous ?? { version: 1, catalogInitialized: false, files: {}, catalog: {} }
        const result: SyncResult = { added: [], updated: [], adopted: [], preserved: [], conflicted: [] }
        const files: string[] = templateFiles.filter((file) => file !== 'templates.json')
        for (const directory of templateDirectories) files.push(...(await inventory(builtinRoot, directory)))
        // Check paths before legacy migrations or writes; never follow an external asset symlink.
        for (const file of ['templates.json', ...files]) {
            await assertTemplatePath(root, join(root, file))
            await assertTemplatePath(builtinRoot, join(builtinRoot, file))
        }
        for (const directory of templateDirectories) {
            await assertTemplatePath(root, join(root, directory))
            await fs.mkdir(join(root, directory), { recursive: true })
        }
        const builtinCatalog = await readBuiltinTemplateCatalog(builtinRoot)
        // Publish assets before descriptors, so other replicas never discover a new missing YAML.
        for (const file of files) {
            const target = join(root, file)
            const builtin = await fs.readFile(join(builtinRoot, file))
            const builtinHash = hashContent(builtin)
            const current = await readOptionalFile(target)
            const currentHash = current === undefined ? undefined : hashContent(current)
            if (planSync(manifest.files, file, currentHash, builtinHash, result, file, false)) {
                await saveSyncManifest(root, manifest)
                await atomicTemplateWrite(root, target, builtin, currentHash ?? null)
                manifest.files[file].hash = builtinHash
                delete manifest.files[file].pending
                await saveSyncManifest(root, manifest)
            }
        }
        // Preserve the one-time migrations of older installations before establishing a baseline.
        if (!manifest.catalogInitialized && (await readOptionalFile(join(root, 'templates.json')))) {
            await upgradeBuiltinTemplateCatalog(builtinRoot, root)
        }
        await syncTemplateCatalog(root, builtinCatalog, manifest, result, !manifest.catalogInitialized)
        manifest.catalogInitialized = true
        await saveSyncManifest(root, manifest)
        return result
    })
}
