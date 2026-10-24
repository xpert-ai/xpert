import { HttpException, Logger } from '@nestjs/common'
import type { AgentPluginStorageErrorCode } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { hostname } from 'node:os'
import { readFile } from 'node:fs/promises'
import { containedPath, PackagePathEscapeError } from './agent-plugin-path'
import { fileErrorCode, portablePackageDigest, PortablePackageIntegrityError } from './portable-package-files'

interface StoredPackage {
    id?: string
    rootPath: string
    digest: string
}

const messages = {
    AGENT_PLUGIN_STORAGE_MISSING: [
        'AgentPluginStorageMissing',
        'Plugin files are unavailable. Contact an administrator.'
    ],
    AGENT_PLUGIN_STORAGE_UNREADABLE: [
        'AgentPluginStorageUnreadable',
        'Plugin files cannot be read. Contact an administrator.'
    ],
    AGENT_PLUGIN_STORAGE_CORRUPT: [
        'AgentPluginStorageCorrupt',
        'Plugin files failed verification. Contact an administrator.'
    ]
} satisfies Record<AgentPluginStorageErrorCode, [string, string]>

export class AgentPluginStorageException extends HttpException {
    constructor(code: AgentPluginStorageErrorCode) {
        const statusCode = code === 'AGENT_PLUGIN_STORAGE_CORRUPT' ? 409 : 503
        const [key, defaultValue] = messages[code]
        super({ statusCode, code, message: t(`server-ai:Error.${key}`, { defaultValue }) || defaultValue }, statusCode)
    }
}

const logger = new Logger('AgentPluginStorage')
function fail(pkg: StoredPackage, code: AgentPluginStorageErrorCode, error?: unknown, actualDigest?: string): never {
    // Diagnostic details stay in server logs, never in the HTTP response or stored user-facing receipt.
    logger.error({
        code,
        packageId: pkg.id,
        rootPath: pkg.rootPath,
        expectedDigest: pkg.digest,
        actualDigest,
        errno: fileErrorCode(error),
        instance: hostname(),
        pid: process.pid
    })
    throw new AgentPluginStorageException(code)
}

function readFailure(pkg: StoredPackage, error: unknown): never {
    if (error instanceof AgentPluginStorageException) throw error
    if (error instanceof PortablePackageIntegrityError || error instanceof PackagePathEscapeError)
        fail(pkg, 'AGENT_PLUGIN_STORAGE_CORRUPT', error)
    fail(
        pkg,
        fileErrorCode(error) === 'ENOENT' ? 'AGENT_PLUGIN_STORAGE_MISSING' : 'AGENT_PLUGIN_STORAGE_UNREADABLE',
        error
    )
}

export async function assertAgentPluginStorage(pkg: StoredPackage) {
    let digest: string
    try {
        digest = await portablePackageDigest(pkg.rootPath, true)
    } catch (error) {
        readFailure(pkg, error)
    }
    if (digest !== pkg.digest) fail(pkg, 'AGENT_PLUGIN_STORAGE_CORRUPT', undefined, digest)
}

/** Validate on both sides of a read so a changed file cannot be returned under an old digest. */
export async function withVerifiedAgentPluginRead<T>(pkg: StoredPackage, read: () => Promise<T>): Promise<T> {
    await assertAgentPluginStorage(pkg)
    let content: T
    try {
        content = await read()
    } catch (error) {
        if (
            fileErrorCode(error) ||
            error instanceof PortablePackageIntegrityError ||
            error instanceof PackagePathEscapeError
        )
            readFailure(pkg, error)
        throw error
    }
    await assertAgentPluginStorage(pkg)
    return content
}

export function readVerifiedAgentPluginFile(pkg: StoredPackage, path: string) {
    return withVerifiedAgentPluginRead(pkg, async () => readFile(await containedPath(pkg.rootPath, path), 'utf8'))
}
