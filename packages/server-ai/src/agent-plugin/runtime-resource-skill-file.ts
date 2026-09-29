import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

/** Read-only fallback for selected portable Skills when the Assistant has no sandbox. */
export async function readRuntimeResourceSkillFile(root: string, path: string): Promise<string> {
    const base = await realpath(root)
    const target = await realpath(resolve(base, path))
    const child = relative(base, target)
    if (!child || isAbsolute(child) || child === '..' || child.startsWith('../'))
        throw new Error('Skill file is outside the selected package')
    const file = await open(target, 'r')
    try {
        const info = await file.stat()
        if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Skill file exceeds the read limit')
        return await file.readFile('utf8')
    } finally {
        await file.close()
    }
}
