import { Logger, type LoggerService } from '@nestjs/common'
import { TSandboxConfigurable } from '@xpert-ai/contracts'
import { resolveSandboxBackend, type SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'
import path from 'node:path'
import { getXpertFileMemoryWorkspacePath, normalizeFileMemoryRelativePath } from './paths'

const MEMORY_STORE_LOG_PREFIX = '[XpertFileMemory]'

type DownloadFileResponse = {
    path: string
    content: Uint8Array | null
    error: string | null
}

export class XpertSandboxMemoryStore {
    readonly rootPath: string
    readonly cacheKey: string
    readonly workingDirectory: string | null

    constructor(
        readonly backend: SandboxBackendProtocol,
        readonly xpertId: string,
        readonly sandbox?: TSandboxConfigurable | null
    ) {
        this.rootPath = getXpertFileMemoryWorkspacePath(xpertId)
        this.workingDirectory =
            (typeof sandbox?.workingDirectory === 'string' && sandbox.workingDirectory.trim()) ||
            (typeof backend.workingDirectory === 'string' && backend.workingDirectory.trim()) ||
            null
        this.cacheKey = [backend.id, this.workingDirectory ?? 'unknown', this.rootPath].join(':')
    }

    static fromSandbox(sandbox: TSandboxConfigurable | null | undefined, xpertId: string) {
        const backend = resolveSandboxBackend(sandbox)
        if (!backend) {
            return null
        }
        return new XpertSandboxMemoryStore(backend, xpertId, sandbox)
    }

    static require(
        sandbox: TSandboxConfigurable | null | undefined,
        xpertId: string,
        logger?: LoggerService,
        reason = 'file memory runtime'
    ) {
        const store = XpertSandboxMemoryStore.fromSandbox(sandbox, xpertId)
        if (store) {
            return store
        }

        logger?.warn?.(`${MEMORY_STORE_LOG_PREFIX} sandbox backend is unavailable for ${reason}`)
        throw new Error(`Sandbox backend is unavailable for ${reason}.`)
    }

    resolvePath(...segments: Array<string | undefined | null>) {
        return normalizeFileMemoryRelativePath(path.posix.join(this.rootPath, ...segments.filter(Boolean).map((segment) => `${segment}`)))
    }

    async listMarkdownFiles(directory: string) {
        return this.listFiles(directory, '*.md')
    }

    async listFiles(directory: string, pattern = '*') {
        const baseDir = this.resolvePath(directory)
        const normalizedDirectory = normalizeFileMemoryRelativePath(directory)
        let entries
        try {
            entries = await this.backend.globInfo(pattern, baseDir)
        } catch (error) {
            if (isMissingPathError(error)) {
                return []
            }
            throw error
        }

        return entries
            .filter((entry) => !entry.is_dir && typeof entry.path === 'string')
            .map((entry) => normalizeListedPath(entry.path))
            .map((entryPath) => resolveListedFilePath(this.rootPath, normalizedDirectory, entryPath))
            .filter(Boolean)
    }

    async readFile(filePath: string) {
        const targetPath = this.resolvePath(filePath)
        const result = (await this.backend.downloadFiles([targetPath]))[0] as DownloadFileResponse | undefined
        if (!result || result.error || !result.content) {
            throw createFileError('ENOENT', `File not found: ${targetPath}`)
        }
        return Buffer.from(result.content).toString('utf8')
    }

    async writeFile(filePath: string, content: string) {
        const targetPath = this.resolvePath(filePath)
        const result = await this.backend.uploadFiles([[targetPath, Buffer.from(content, 'utf8')]])
        const first = result[0]
        if (!first || first.error) {
            throw new Error(`Failed to write file ${targetPath}: ${first?.error ?? 'unknown_error'}`)
        }
    }

    async getMtimeMs(filePath: string) {
        const targetPath = this.resolvePath(filePath)
        const directory = path.posix.dirname(targetPath)
        const baseName = path.posix.basename(targetPath)
        const entries = await this.backend.lsInfo(directory)
        const matched = entries.find((entry) => path.posix.basename(normalizeListedPath(entry.path)) === baseName)
        if (!matched) {
            throw createFileError('ENOENT', `File not found: ${targetPath}`)
        }
        return matched.modified_at ? Math.floor(new Date(matched.modified_at).getTime()) : Date.now()
    }

    async ensureRoot(types: string[], dreamDir: string) {
        const directories = [
            this.rootPath,
            ...types.map((type) => this.resolvePath(type)),
            this.resolvePath(dreamDir, 'signals'),
            this.resolvePath(dreamDir, 'scorecards')
        ]
        const result = await this.backend.execute(`mkdir -p ${directories.map(shellQuote).join(' ')}`)
        if (result.exitCode !== 0) {
            throw new Error(result.output || `Failed to create file memory root: ${this.rootPath}`)
        }
    }
}

export type FileMemoryStore = XpertSandboxMemoryStore

export function extractSandboxConfig(runtimeLike: unknown): TSandboxConfigurable | null {
    if (!runtimeLike || typeof runtimeLike !== 'object') {
        return null
    }

    const runtimeRecord = runtimeLike as {
        configurable?: {
            sandbox?: TSandboxConfigurable | null
        }
        sandbox?: TSandboxConfigurable | null
    }

    return runtimeRecord.configurable?.sandbox ?? runtimeRecord.sandbox ?? null
}

export function assertFileMemorySandboxFeatureEnabled(context: { xpertFeatures?: { sandbox?: { enabled?: boolean } } | null }) {
    if (context.xpertFeatures?.sandbox?.enabled === true) {
        return
    }
    throw new Error('XpertFileMemoryMiddleware requires the xpert sandbox feature to be enabled.')
}

export function resolveSandboxMemoryStore(
    sandbox: TSandboxConfigurable | null | undefined,
    xpertId: string,
    logger?: LoggerService,
    reason?: string
) {
    return XpertSandboxMemoryStore.require(sandbox, xpertId, logger ?? new Logger('XpertSandboxMemoryStore'), reason)
}

function normalizeListedPath(value?: string | null) {
    return `${value ?? ''}`.replace(/\\/g, '/').replace(/\/+$/, '')
}

function stripRootPath(rootPath: string, value: string) {
    const normalizedRoot = normalizeListedPath(rootPath)
    const normalizedValue = normalizeListedPath(value)
    if (normalizedValue === normalizedRoot) {
        return ''
    }
    if (normalizedValue.startsWith(`${normalizedRoot}/`)) {
        return normalizedValue.slice(normalizedRoot.length + 1)
    }
    return normalizeFileMemoryRelativePath(normalizedValue)
}

function resolveListedFilePath(rootPath: string, directory: string, value: string) {
    const relativePath = stripRootPath(rootPath, value)
    if (!directory || relativePath === directory || relativePath.startsWith(`${directory}/`)) {
        return relativePath
    }
    return normalizeFileMemoryRelativePath(path.posix.join(directory, relativePath))
}

function createFileError(code: 'ENOENT', message: string) {
    const error = new Error(message) as NodeJS.ErrnoException
    error.code = code
    return error
}

function isMissingPathError(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'ENOENT') {
        return true
    }

    return error instanceof Error && /not found/i.test(error.message)
}

function shellQuote(value: string) {
    return `'${value.replace(/'/g, `'\\''`)}'`
}
