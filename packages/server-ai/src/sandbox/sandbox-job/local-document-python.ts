import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const LOCAL_DOCUMENT_PYTHON_INSTALL_COMMAND =
    'corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-python'

/** Matches the Runtime Suite installer; never resolves a plugin-specific executable or host PATH fallback. */
export async function localDocumentPython(manifest: Record<string, string>): Promise<string> {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.pythonVersion) || !/^[a-f0-9]{64}$/.test(manifest.requirementsSha256)) {
        throw new Error('Document Python Runtime manifest is incomplete.')
    }
    const cache = process.env.XDG_CACHE_HOME?.trim() || path.join(homedir(), '.cache')
    const executable = path.join(
        cache,
        'xpert',
        'sandbox-runtime',
        'document-python',
        manifest.pythonVersion,
        manifest.requirementsSha256,
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3'
    )
    try {
        await access(executable, constants.X_OK)
    } catch {
        throw new Error(`Document Python Runtime is not installed. Run ${LOCAL_DOCUMENT_PYTHON_INSTALL_COMMAND}.`)
    }
    return executable
}
