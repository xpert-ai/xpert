import { TemplateFiles, templateFilesSchema } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { VolumeHandle } from './volume'
import { VolumeWorkspaceStorage } from './workspace-storage'

/** Callers authorize the exact Assistant and current user before entering this Volume operation. */
export async function initializeTemplateFiles(volume: VolumeHandle, definition: TemplateFiles) {
    const files = templateFilesSchema.parse(definition)
    const fingerprint = createHash('sha256').update(JSON.stringify(files)).digest('hex')
    const storage = new VolumeWorkspaceStorage(async () => volume, 'platform_template_initialization')
    return storage.withLock('initialize', async () => {
        const marker = `${fingerprint}.json`
        try {
            await storage.read(marker)
            return { created: [], skipped: files.entries.map((entry) => entry.path) }
        } catch (error) {
            if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
        }
        const created: string[] = [],
            skipped: string[] = []
        await volume.ensureRoot()
        for (const entry of files.entries) {
            if (entry.kind === 'directory') {
                await VolumeHandle.ensureDirectory(volume.serverRoot, entry.path, volume.serverRoot, true)
                continue
            }
            const content =
                entry.kind === 'file'
                    ? entry.content
                    : JSON.stringify(
                          {
                              structureVersion: entry.structureVersion,
                              columns: entry.columns,
                              rows: []
                          },
                          null,
                          2
                      ) + '\n'
            const written = await volume.writeFile(entry.path, content, { createOnly: true })
            ;(written ? created : skipped).push(entry.path)
        }
        await storage.write(marker, JSON.stringify({ fingerprint, completedAt: new Date().toISOString() }))
        return { created, skipped }
    })
}
