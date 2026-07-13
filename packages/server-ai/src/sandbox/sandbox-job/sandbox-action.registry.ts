/**
 * Invariants:
 * - Only system-level plugins may contribute executable Sandbox Actions in v1.
 * - Bundle roots and entrypoints come from the installed plugin manifest, never from a run request.
 * - Every file is verified before upload; plugin installation paths are never mounted into containers.
 */
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { PLUGIN_LEVEL, type XpertPluginSandboxActionDefinition } from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    type LoadedPluginRecord,
    normalizePluginName,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'

const MAX_BUNDLE_BYTES = 256 * 1024 * 1024
const MAX_BUNDLE_FILES = 20_000
const SHA256_PATTERN = /^[a-f0-9]{64}$/i

/** Verified metadata for one immutable regular file in an Action Bundle. */
export type SandboxActionBundleFile = {
    relativePath: string
    absolutePath: string
    size: number
    sha256: string
}

/** Fully resolved system-plugin Action that is safe to materialize into a Job workspace. */
export type RegisteredSandboxAction = {
    pluginName: string
    name: string
    version: string
    runtimeProfile: string
    runtimeContractVersion: string
    playwrightVersion?: string
    bundleSha256: string
    bundleRoot: string
    entrypoint: string
    files: readonly SandboxActionBundleFile[]
}

/** In-memory copy of a hash-verified Action file shared across Jobs in one Worker. */
export type CachedSandboxActionBundleFile = {
    relativePath: string
    content: Buffer
}

/**
 * Resolves executable Actions from installed system plugins and verifies every
 * path, file type, size, and tree hash before a Runtime can see bundle content.
 */
@Injectable()
export class SandboxActionRegistry {
    private readonly cache = new Map<string, Promise<RegisteredSandboxAction>>()
    /** Immutable, verified bundle contents are shared by bundle hash across jobs in this worker. */
    private readonly bundleCache = new Map<string, Promise<readonly CachedSandboxActionBundleFile[]>>()

    constructor(@Inject(LOADED_PLUGINS) private readonly loadedPlugins: LoadedPluginRecord[]) {}

    /** Resolves an exact plugin/action/version identity, caching only verified results. */
    async get(input: {
        pluginName: string
        action: string
        actionVersion: string
    }): Promise<RegisteredSandboxAction | null> {
        const pluginName = normalizePluginName(input.pluginName)
        const cacheKey = `${pluginName}\0${input.action}\0${input.actionVersion}`
        let cached = this.cache.get(cacheKey)
        if (!cached) {
            cached = this.resolve({ ...input, pluginName })
            this.cache.set(cacheKey, cached)
        }
        try {
            return await cached
        } catch (error) {
            this.cache.delete(cacheKey)
            throw error
        }
    }

    /** Revalidates file identity and digest immediately before it enters the immutable cache. */
    async readVerifiedFile(file: SandboxActionBundleFile): Promise<Buffer> {
        const stat = await lstat(file.absolutePath)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== file.size) {
            throw new Error(`Sandbox Action bundle file changed: ${file.relativePath}`)
        }
        const content = await readFile(file.absolutePath)
        if (sha256(content) !== file.sha256) throw new Error(`Sandbox Action bundle file changed: ${file.relativePath}`)
        return content
    }

    /** Returns immutable bundle bytes keyed by the deterministic tree hash. */
    async getCachedBundle(action: RegisteredSandboxAction): Promise<readonly CachedSandboxActionBundleFile[]> {
        let cached = this.bundleCache.get(action.bundleSha256)
        if (!cached) {
            cached = Promise.all(
                action.files.map(async (file) => ({
                    relativePath: file.relativePath,
                    content: await this.readVerifiedFile(file)
                }))
            )
            this.bundleCache.set(action.bundleSha256, cached)
        }
        try {
            return await cached
        } catch (error) {
            this.bundleCache.delete(action.bundleSha256)
            throw error
        }
    }

    private async resolve(input: {
        pluginName: string
        action: string
        actionVersion: string
    }): Promise<RegisteredSandboxAction | null> {
        const matchingPlugins = this.loadedPlugins.filter(
            (candidate) => normalizePluginName(candidate.packageName ?? candidate.name) === input.pluginName
        )
        const plugin = matchingPlugins.find((candidate) => candidate.level === PLUGIN_LEVEL.SYSTEM)
        if (!plugin) return null
        if (matchingPlugins.some((candidate) => candidate.level !== PLUGIN_LEVEL.SYSTEM)) {
            throw new Error(`Sandbox Actions are restricted to system-level plugins: ${input.pluginName}`)
        }
        const pluginRoot = resolveLoadedPluginBundleRoot(plugin)
        if (!pluginRoot) throw new Error(`Unable to resolve plugin bundle root: ${input.pluginName}`)
        const declarations = await readActionDeclarations(pluginRoot)
        if (declarations === undefined) return null
        const candidates = await this.readDefinitions(pluginRoot, declarations)
        const match = candidates.find(
            (definition) => definition.value.name === input.action && definition.value.version === input.actionVersion
        )
        if (!match) return null
        return this.verifyDefinition(input.pluginName, pluginRoot, match)
    }

    private async readDefinitions(
        pluginRoot: string,
        value: unknown
    ): Promise<Array<{ value: XpertPluginSandboxActionDefinition; baseDirectory: string }>> {
        const values = Array.isArray(value) ? value : [value]
        const definitions: Array<{ value: XpertPluginSandboxActionDefinition; baseDirectory: string }> = []
        for (const entry of values) {
            if (typeof entry === 'string') {
                const actionManifestPath = safeResolve(pluginRoot, entry, 'Sandbox Action manifest')
                const raw: unknown = JSON.parse(await readFile(actionManifestPath, 'utf8'))
                definitions.push({
                    value: parseDefinition(raw, actionManifestPath),
                    baseDirectory: path.dirname(actionManifestPath)
                })
            } else if (isObject(entry)) {
                definitions.push({
                    value: parseDefinition(entry, 'plugin.json sandboxActions'),
                    baseDirectory: pluginRoot
                })
            } else {
                throw new Error('plugin.json sandboxActions must contain manifest paths or Action definitions.')
            }
        }
        return definitions
    }

    private async verifyDefinition(
        pluginName: string,
        pluginRoot: string,
        definition: { value: XpertPluginSandboxActionDefinition; baseDirectory: string }
    ): Promise<RegisteredSandboxAction> {
        if (!SHA256_PATTERN.test(definition.value.bundleSha256))
            throw new Error('Sandbox Action bundleSha256 is invalid.')
        const bundleRoot = safeResolve(definition.baseDirectory, definition.value.bundle, 'Sandbox Action bundle')
        const bundleRealPath = await realpath(bundleRoot)
        if (!isWithin(await realpath(pluginRoot), bundleRealPath))
            throw new Error('Sandbox Action bundle escapes plugin root.')
        const files = await collectFiles(bundleRealPath)
        if (
            files.some(
                (file) =>
                    file.relativePath === 'node_modules/playwright-core/package.json' ||
                    file.relativePath.startsWith('node_modules/playwright-core/')
            )
        ) {
            throw new Error('Sandbox Action bundles cannot override Runtime-provided playwright-core.')
        }
        const actualHash = treeSha256(files)
        if (actualHash !== definition.value.bundleSha256.toLowerCase()) {
            throw new Error(
                `Sandbox Action bundle hash mismatch for ${definition.value.name}@${definition.value.version}.`
            )
        }
        const entrypoint = normalizeRelativePath(definition.value.entrypoint, 'Sandbox Action entrypoint')
        if (!files.some((file) => file.relativePath === entrypoint))
            throw new Error('Sandbox Action entrypoint is not a regular bundle file.')
        return {
            pluginName,
            name: definition.value.name,
            version: definition.value.version,
            runtimeProfile: definition.value.runtimeProfile,
            runtimeContractVersion: definition.value.runtimeContractVersion,
            ...(definition.value.playwrightVersion ? { playwrightVersion: definition.value.playwrightVersion } : {}),
            bundleSha256: actualHash,
            bundleRoot: bundleRealPath,
            entrypoint,
            files
        }
    }
}

async function readActionDeclarations(pluginRoot: string): Promise<unknown> {
    for (const relativePath of ['.xpertai-plugin/plugin.json', 'plugin.json']) {
        try {
            const value: unknown = JSON.parse(await readFile(path.join(pluginRoot, relativePath), 'utf8'))
            if (!isObject(value)) throw new Error(`${relativePath} must contain an object.`)
            return value.sandboxActions
        } catch (error) {
            if (!isMissing(error)) throw error
        }
    }
    return undefined
}

async function collectFiles(root: string): Promise<SandboxActionBundleFile[]> {
    const files: SandboxActionBundleFile[] = []
    let totalBytes = 0
    async function visit(directory: string): Promise<void> {
        const entries = await readdir(directory, { withFileTypes: true })
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
            if (entry.name.includes('\0')) throw new Error('Sandbox Action path contains a null byte.')
            const absolutePath = path.join(directory, entry.name)
            const stat = await lstat(absolutePath)
            if (stat.isSymbolicLink()) throw new Error(`Sandbox Action bundles cannot contain symlinks: ${entry.name}`)
            if (stat.isDirectory()) {
                await visit(absolutePath)
                continue
            }
            if (!stat.isFile() || stat.nlink !== 1)
                throw new Error(`Sandbox Action bundle entry must be a regular, unlinked file: ${entry.name}`)
            const relativePath = normalizeRelativePath(path.relative(root, absolutePath), 'Sandbox Action file')
            const content = await readFile(absolutePath)
            totalBytes += content.length
            if (totalBytes > MAX_BUNDLE_BYTES) throw new Error('Sandbox Action bundle exceeds 256 MiB.')
            files.push({ relativePath, absolutePath, size: content.length, sha256: sha256(content) })
            if (files.length > MAX_BUNDLE_FILES) throw new Error('Sandbox Action bundle exceeds 20,000 files.')
        }
    }
    await visit(root)
    if (!files.length) throw new Error('Sandbox Action bundle is empty.')
    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function parseDefinition(value: unknown, source: string): XpertPluginSandboxActionDefinition {
    if (!isObject(value)) throw new Error(`${source} must contain an object.`)
    const definition: XpertPluginSandboxActionDefinition = {
        name: requiredString(value.name, `${source}.name`),
        version: requiredString(value.version, `${source}.version`),
        runtimeProfile: requiredString(value.runtimeProfile, `${source}.runtimeProfile`),
        runtimeContractVersion: requiredString(value.runtimeContractVersion, `${source}.runtimeContractVersion`),
        bundle: requiredString(value.bundle, `${source}.bundle`),
        entrypoint: requiredString(value.entrypoint, `${source}.entrypoint`),
        bundleSha256: requiredString(value.bundleSha256, `${source}.bundleSha256`).toLowerCase()
    }
    if (value.playwrightVersion !== undefined)
        definition.playwrightVersion = requiredString(value.playwrightVersion, `${source}.playwrightVersion`)
    return definition
}

function safeResolve(root: string, relativePath: string, field: string): string {
    const normalized = normalizeRelativePath(relativePath, field)
    const resolved = path.resolve(root, normalized)
    if (!isWithin(path.resolve(root), resolved)) throw new Error(`${field} escapes its root.`)
    return resolved
}
function normalizeRelativePath(value: string, field: string): string {
    const normalized = value.replace(/\\/g, '/')
    if (!normalized || normalized.includes('\0') || path.posix.isAbsolute(normalized))
        throw new Error(`${field} must be a safe relative path.`)
    const clean = path.posix.normalize(normalized)
    if (clean === '.' || clean === '..' || clean.startsWith('../'))
        throw new Error(`${field} must be a safe relative path.`)
    return clean
}
function isWithin(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate)
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
function treeSha256(files: readonly SandboxActionBundleFile[]): string {
    const hash = createHash('sha256')
    for (const file of files) hash.update(`${file.relativePath}\0${file.size}\0${file.sha256}\n`)
    return hash.digest('hex')
}
function sha256(value: Uint8Array): string {
    return createHash('sha256').update(value).digest('hex')
}
function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
    return value.trim()
}
function isMissing(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
