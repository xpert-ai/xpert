import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertWorkspaceLeases } from '../../shared/volume/workspace-storage-lock'

export async function writeMemoryFileAtomically(absolutePath: string, content: string) {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    const temp = absolutePath + '.' + randomUUID() + '.tmp'
    try {
        await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx' })
        await assertWorkspaceLeases()
        await fs.rename(temp, absolutePath)
    } finally {
        await fs.rm(temp, { force: true })
    }
}
