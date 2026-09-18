import { access, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'

/** Platform-owned cache, never an executable or dependency path supplied by a plugin/user document. */
export async function localDocumentDependencyRoot(manifest: Record<string, string>): Promise<string> {
    const family = manifest.imageFamily
    if (!['document-node', 'document-java'].includes(family) || !/^[a-f0-9]{64}$/.test(manifest.dependenciesSha256)) {
        throw new Error('Document Runtime dependency manifest is incomplete.')
    }
    const root = path.join(
        process.env.XDG_CACHE_HOME?.trim() || path.join(homedir(), '.cache'),
        'xpert',
        'sandbox-runtime',
        family,
        manifest.dependenciesSha256
    )
    try {
        const lock = await readFile(path.join(root, 'dependencies.lock.json'))
        if (createHash('sha256').update(lock).digest('hex') !== manifest.dependenciesSha256)
            throw new Error('Lock mismatch')
        await access(
            path.join(root, family === 'document-node' ? 'node_modules/@firecrawl/anydoc/anydoc.js' : 'jre/bin/java')
        )
        if (family === 'document-java' && JSON.parse(lock.toString('utf8')).ocr) {
            await access(path.join(root, 'python/bin/python3'))
            await access(path.join(root, 'hybrid-backend.py'))
            await access(path.join(root, 'models.lock.json'))
        }
    } catch {
        throw new Error(
            `Document Runtime is missing or invalid. Run corepack pnpm --filter @xpert-ai/sandbox-runtime install:${family}.`
        )
    }
    return root
}
