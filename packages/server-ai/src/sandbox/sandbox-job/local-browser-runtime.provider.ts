import { LocalBrowserRuntimeInstance, requireDevelopmentRuntime } from './local-browser-runtime-instance'
import { exposeLocalReadOnlyFile } from './local-browser-runtime-files'
import { LocalRuntimeControl } from './local-runtime-control'
import { sandboxTargetsEqual, type SandboxRuntimeTarget } from '@xpert-ai/contracts'
import { execFile } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { localDocumentDependencyRoot } from './local-document-dependencies'
import { localDocumentPython, LOCAL_DOCUMENT_PYTHON_INSTALL_COMMAND } from './local-document-python'
import { localDocumentFontEnvironment } from './local-document-fonts'
import { localRuntimeProbeFailure, runLocalRuntimeProcess as runProcess } from './local-runtime-process'
import { Injectable } from '@nestjs/common'
import {
    isDevelopmentSandboxRuntimeEnvironment,
    SandboxRuntimeProviderStrategy,
    type ISandboxRuntimeProvider,
    type SandboxRuntimeBinding,
    type SandboxRuntimeBindingHealth,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDestroyOptions,
    type SandboxRuntimeInstance
} from '@xpert-ai/plugin-sdk'
import {
    AI_BROWSER_RUNTIME_PROFILE,
    DEFAULT_BROWSER_RUNTIME_PROFILE,
    DOCUMENT_LIBREOFFICE_RUNTIME_PROFILE,
    DOCUMENT_PYTHON_RUNTIME_PROFILE,
    DOCUMENT_NODE_RUNTIME_PROFILE,
    DOCUMENT_JAVA_RUNTIME_PROFILE,
    VIDEO_BROWSER_RUNTIME_PROFILE
} from './sandbox-runtime-definition.registry'

export const LOCAL_BROWSER_RUNTIME_PROVIDER = 'local-browser-runtime'
export const LOCAL_BROWSER_RUNTIME_BINDING = 'local-browser-runtime:browser-playwright-1.61-v1'
export const LOCAL_AI_BROWSER_RUNTIME_BINDING = 'local-browser-runtime:browser-ai-playwright-1.61-v1'
export const LOCAL_VIDEO_BROWSER_RUNTIME_BINDING = 'local-browser-runtime:browser-video-playwright-1.61-v1'
export const LOCAL_DOCUMENT_RUNTIME_BINDING = 'local-browser-runtime:document-libreoffice-v1'

const LOCAL_PROVIDER_VERSION = '1.0.0'
const LOCAL_BINDING_PRIORITY = 10_000
const HEALTH_TIMEOUT_MS = 15_000
const DOCUMENT_HEALTH_TIMEOUT_MS = 60_000
const HEALTH_CACHE_TTL_MS = 30_000
const FAILED_HEALTH_CACHE_TTL_MS = 5_000
const LOCAL_BROWSER_INSTALL_COMMAND = 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:browser'
const LOCAL_AI_INSTALL_COMMAND = 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:ai'
const LOCAL_VIDEO_INSTALL_COMMAND = 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:video'
const LOCAL_DOCUMENT_INSTALL_COMMAND =
    'Install LibreOffice, Poppler (pdftotext), fontconfig, Noto CJK and Noto Color Emoji fonts on PATH.'
const execFileAsync = promisify(execFile)

type LocalRuntimeConfiguration = {
    bindingId: string
    imageFamily:
        | 'browser'
        | 'browser-ai'
        | 'browser-video'
        | 'document'
        | 'document-python'
        | 'document-node'
        | 'document-java'
    artifactReference: string
    installCommand: string
    requiresFfmpeg: boolean
    requiresAiResources: boolean
    requiresLibreOffice: boolean
    requiresPython?: boolean
    requiresDocumentDependencies?: boolean
}

const LOCAL_RUNTIME_CONFIGURATIONS: Readonly<Record<string, LocalRuntimeConfiguration>> = {
    [DEFAULT_BROWSER_RUNTIME_PROFILE]: {
        bindingId: LOCAL_BROWSER_RUNTIME_BINDING,
        imageFamily: 'browser',
        artifactReference: 'xpert-source://sandbox-runtime/browser-playwright-1.61-v1',
        installCommand: LOCAL_BROWSER_INSTALL_COMMAND,
        requiresFfmpeg: false,
        requiresAiResources: false,
        requiresLibreOffice: false
    },
    [AI_BROWSER_RUNTIME_PROFILE]: {
        bindingId: LOCAL_AI_BROWSER_RUNTIME_BINDING,
        imageFamily: 'browser-ai',
        artifactReference: 'xpert-source://sandbox-runtime/browser-ai-playwright-1.61-v1',
        installCommand: LOCAL_AI_INSTALL_COMMAND,
        requiresFfmpeg: false,
        requiresAiResources: true,
        requiresLibreOffice: false
    },
    [VIDEO_BROWSER_RUNTIME_PROFILE]: {
        bindingId: LOCAL_VIDEO_BROWSER_RUNTIME_BINDING,
        imageFamily: 'browser-video',
        artifactReference: 'xpert-source://sandbox-runtime/browser-video-playwright-1.61-v1',
        installCommand: LOCAL_VIDEO_INSTALL_COMMAND,
        requiresFfmpeg: true,
        requiresAiResources: false,
        requiresLibreOffice: false
    },
    [DOCUMENT_NODE_RUNTIME_PROFILE]: {
        bindingId: 'local-browser-runtime:document-node-v1',
        imageFamily: 'document-node',
        artifactReference: 'xpert-source://sandbox-runtime/document-node-v1',
        installCommand: 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-node',
        requiresFfmpeg: false,
        requiresAiResources: false,
        requiresLibreOffice: false,
        requiresDocumentDependencies: true
    },
    [DOCUMENT_JAVA_RUNTIME_PROFILE]: {
        bindingId: 'local-browser-runtime:document-java-v1',
        imageFamily: 'document-java',
        artifactReference: 'xpert-source://sandbox-runtime/document-java-v1',
        installCommand: 'corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-java',
        requiresFfmpeg: false,
        requiresAiResources: false,
        requiresLibreOffice: false,
        requiresDocumentDependencies: true
    },
    [DOCUMENT_PYTHON_RUNTIME_PROFILE]: {
        bindingId: 'local-browser-runtime:document-python-3.12-v1',
        imageFamily: 'document-python',
        artifactReference: 'xpert-source://sandbox-runtime/document-python-3.12-v1',
        installCommand: LOCAL_DOCUMENT_PYTHON_INSTALL_COMMAND,
        requiresFfmpeg: false,
        requiresAiResources: false,
        requiresLibreOffice: false,
        requiresPython: true
    },
    [DOCUMENT_LIBREOFFICE_RUNTIME_PROFILE]: {
        bindingId: LOCAL_DOCUMENT_RUNTIME_BINDING,
        imageFamily: 'document',
        artifactReference: 'xpert-source://sandbox-runtime/document-libreoffice-v1',
        installCommand: LOCAL_DOCUMENT_INSTALL_COMMAND,
        requiresFfmpeg: false,
        requiresAiResources: false,
        requiresLibreOffice: true
    }
}

/**
 * Development-only Browser Runtime backed by a child process on the Xpert host.
 *
 * This Provider deliberately advertises weaker guarantees than the Browser
 * Definition. Its developmentOnly Binding is the only reason Core may select
 * it, and every executable method independently rejects production mode.
 */
@Injectable()
@SandboxRuntimeProviderStrategy(LOCAL_BROWSER_RUNTIME_PROVIDER)
export class LocalBrowserRuntimeProvider implements ISandboxRuntimeProvider {
    readonly type = LOCAL_BROWSER_RUNTIME_PROVIDER
    readonly version = LOCAL_PROVIDER_VERSION
    readonly capabilities = {
        executionControl: 1,
        isolation: 'process',
        ephemeral: true,
        resourceLimits: false,
        networkPolicy: false,
        readOnlyRootFilesystem: false,
        readOnlyFileMounts: true
    } as const

    private readonly instances = new Map<string, LocalBrowserRuntimeInstance>()
    private readonly localControl = new LocalRuntimeControl(this.type, this.instances)
    prepareControl(options: SandboxRuntimeDestroyOptions & { generation: string }) {
        return this.localControl.prepare(options)
    }
    control(target: SandboxRuntimeTarget, action: 'inspect' | 'stop') {
        return this.localControl.control(target, action)
    }
    private readonly pendingAssetInstalls = new Map<string, Promise<LocalRuntimeAssets>>()
    private readonly healthCache = new Map<string, { expiresAt: number; health: SandboxRuntimeBindingHealth }>()
    private readonly pendingHealth = new Map<string, Promise<SandboxRuntimeBindingHealth>>()

    /** Publishes last-resort Bindings only in explicit development/test mode. */
    listBindings(): readonly SandboxRuntimeBinding[] {
        if (!isDevelopmentSandboxRuntimeEnvironment()) return []
        return Object.entries(LOCAL_RUNTIME_CONFIGURATIONS).map(([runtimeProfile, configuration]) =>
            localBrowserBinding(runtimeProfile, configuration)
        )
    }

    /** Verifies the pinned local Runner, Runtime manifest, and Playwright browser artifact. */
    async getBindingHealth(input: {
        definition: SandboxRuntimeCreateOptions['definition']
        binding: SandboxRuntimeBinding
    }): Promise<SandboxRuntimeBindingHealth> {
        if (!isDevelopmentSandboxRuntimeEnvironment()) {
            return {
                available: false,
                reason: 'local-browser-runtime is disabled outside development/test.'
            }
        }
        if (!isLocalBinding(input.binding, input.definition.name)) {
            return { available: false, reason: 'Local Browser Runtime Binding does not match the Definition.' }
        }
        const cacheKey = `${input.definition.name}:${input.definition.sandboxRuntimeVersion}:${JSON.stringify(input.definition.expectedManifest)}`
        const cached = this.healthCache.get(cacheKey)
        if (cached?.expiresAt > Date.now()) return cached.health
        const pending = this.pendingHealth.get(cacheKey)
        if (pending) return pending
        const probe = this.probeBindingHealth(input.definition)
        this.pendingHealth.set(cacheKey, probe)
        try {
            const health = await probe
            const ttl = health.available ? HEALTH_CACHE_TTL_MS : FAILED_HEALTH_CACHE_TTL_MS
            this.healthCache.set(cacheKey, { expiresAt: Date.now() + ttl, health })
            return health
        } finally {
            this.pendingHealth.delete(cacheKey)
        }
    }

    private async probeBindingHealth(
        definition: SandboxRuntimeCreateOptions['definition']
    ): Promise<SandboxRuntimeBindingHealth> {
        try {
            const runtime = await resolveLocalRuntimeAssets(definition)
            const manifestResult = await runProcess(runtime.nodePath, [runtime.runnerPath, '--manifest'], {
                timeoutMs: HEALTH_TIMEOUT_MS,
                maxOutputBytes: 256 * 1024,
                cwd: runtime.root,
                env: runtime.environment
            })
            if (manifestResult.exitCode !== 0) {
                return { available: false, reason: localRuntimeProbeFailure(manifestResult, HEALTH_TIMEOUT_MS) }
            }
            const manifest = parseStringRecord(manifestResult.output, 'Local Browser Runtime manifest')
            const mismatch = manifestMismatch(definition.expectedManifest, manifest)
            if (mismatch) return { available: false, reason: mismatch, manifest }

            const configuration = localRuntimeConfiguration(definition.name)
            const healthCommand = configuration.requiresDocumentDependencies
                ? {
                      command: runtime.nodePath,
                      args: [
                          path.join(runtime.root, '../../../scripts/verify-document-runtime.mjs'),
                          path.join(runtime.root, 'manifest.json'),
                          path.join(runtime.root, '../dependencies.lock.json'),
                          runtime.environment.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT,
                          '--readiness'
                      ]
                  }
                : configuration.requiresPython
                  ? {
                        command: await localDocumentPython(definition.expectedManifest),
                        args: [
                            '-I',
                            path.join(runtime.root, 'verify-python.py'),
                            path.join(runtime.root, 'manifest.json'),
                            path.join(runtime.root, '../requirements.txt')
                        ]
                    }
                  : configuration.requiresLibreOffice
                    ? { command: runtime.nodePath, args: [path.join(runtime.root, 'verify-document-preview.mjs')] }
                    : { command: runtime.nodePath, args: [runtime.runnerPath, '--browser-health'] }
            const timeoutMs =
                configuration.requiresDocumentDependencies || configuration.requiresLibreOffice
                    ? DOCUMENT_HEALTH_TIMEOUT_MS
                    : HEALTH_TIMEOUT_MS
            const browserResult = await runProcess(healthCommand.command, healthCommand.args, {
                timeoutMs,
                maxOutputBytes: 256 * 1024,
                cwd: runtime.root,
                env: runtime.environment
            })
            if (browserResult.exitCode !== 0) {
                return {
                    available: false,
                    reason: localRuntimeProbeFailure(browserResult, timeoutMs)
                }
            }
            return { available: true, manifest }
        } catch (error) {
            return { available: false, reason: messageOf(error) }
        }
    }

    /** Creates an isolated Job workspace view without claiming container-grade isolation. */
    async create(options: SandboxRuntimeCreateOptions): Promise<SandboxRuntimeInstance> {
        requireDevelopmentRuntime()
        if (!isLocalBinding(options.binding, options.definition.name)) {
            throw new Error('Local Browser Runtime received an incompatible Binding.')
        }
        const runtimeId = options.controlTarget?.runtimeRef ?? localRuntimeId(options.workFor.id)
        const controlled = options.controlTarget ? this.localControl.controls.get(runtimeId) : undefined
        if (
            options.controlTarget &&
            (!controlled ||
                !sandboxTargetsEqual(controlled.target, options.controlTarget) ||
                controlled.sealed ||
                controlled.creating)
        )
            throw new Error('Sandbox create admission closed')
        const existing = this.instances.get(runtimeId)
        if (existing) {
            if (controlled) throw new Error('Sandbox create admission closed')
            return existing
        }
        if (controlled) controlled.creating = true

        try {
            const assets = await this.resolveAssetsForCreate(options.definition)
            const workspaceRoot = path.resolve(options.volume.serverRoot)
            await mkdir(workspaceRoot, { recursive: true })
            await Promise.all(
                ['input', 'output', 'runtime'].map((directory) =>
                    mkdir(path.join(workspaceRoot, directory), { recursive: true })
                )
            )
            for (const file of options.readOnlyFiles ?? []) {
                await exposeLocalReadOnlyFile(workspaceRoot, file)
            }
            const canonicalRoot = await realpath(workspaceRoot)
            const environment = localRuntimeConfiguration(options.definition.name).requiresLibreOffice
                ? await localDocumentFontEnvironment(workspaceRoot, assets.environment)
                : assets.environment
            // All asynchronous preparation must finish before the final stop/admission check.
            if (controlled?.sealed) throw new Error('Sandbox create cancelled')
            const instance = new LocalBrowserRuntimeInstance({
                controlled: !!controlled,
                id: runtimeId,
                workspaceRoot: canonicalRoot,
                runnerPath: assets.runnerPath,
                nodePath: assets.nodePath,
                environment,
                trustedCommand: options.definition.command,
                hardDeadlineMs: options.hardDeadlineMs
            })
            this.instances.set(runtimeId, instance)
            return instance
        } finally {
            if (controlled) controlled.creating = false
        }
    }

    private resolveAssetsForCreate(definition: SandboxRuntimeCreateOptions['definition']): Promise<LocalRuntimeAssets> {
        const configuration = localRuntimeConfiguration(definition.name)
        if (!configuration.requiresAiResources) return resolveLocalRuntimeAssets(definition)
        const key = `${definition.name}:${definition.sandboxRuntimeVersion}:${definition.expectedManifest.modelCatalogSha256 ?? ''}`
        const existing = this.pendingAssetInstalls.get(key)
        if (existing) return existing
        const pending = resolveLocalRuntimeAssets(definition, true).finally(() => {
            if (this.pendingAssetInstalls.get(key) === pending) this.pendingAssetInstalls.delete(key)
        })
        this.pendingAssetInstalls.set(key, pending)
        return pending
    }

    /** Idempotently terminates a live local process; persisted stale refs require no host cleanup. */
    async destroy(options: SandboxRuntimeDestroyOptions): Promise<void> {
        if (options.controlTarget) {
            const evidence = await this.control(options.controlTarget, 'stop')
            if (evidence.state !== 'exited' && evidence.state !== 'not_started')
                throw new Error('Sandbox exit is unconfirmed')
        }
        const runtimeId = options.controlTarget?.runtimeRef ?? options.runtimeRef ?? localRuntimeId(options.workFor.id)
        const instance = this.instances.get(runtimeId)
        if (!instance) return
        await instance.dispose()
        const control = this.localControl.controls.get(runtimeId)
        if (control) control.exited = true
        this.instances.delete(runtimeId)
    }
}

function localBrowserBinding(runtimeProfile: string, configuration: LocalRuntimeConfiguration): SandboxRuntimeBinding {
    return {
        id: configuration.bindingId,
        runtimeProfile,
        provider: LOCAL_BROWSER_RUNTIME_PROVIDER,
        priority: LOCAL_BINDING_PRIORITY,
        providerVersion: LOCAL_PROVIDER_VERSION,
        artifact: { kind: 'filesystem', reference: configuration.artifactReference },
        developmentOnly: true
    }
}

function isLocalBinding(binding: SandboxRuntimeBinding, runtimeProfile: string): boolean {
    const configuration = LOCAL_RUNTIME_CONFIGURATIONS[runtimeProfile]
    if (!configuration) return false
    return (
        binding.id === configuration.bindingId &&
        binding.provider === LOCAL_BROWSER_RUNTIME_PROVIDER &&
        binding.runtimeProfile === runtimeProfile &&
        binding.artifact.kind === 'filesystem' &&
        binding.artifact.reference === configuration.artifactReference &&
        binding.developmentOnly === true
    )
}

function localRuntimeConfiguration(runtimeProfile: string): LocalRuntimeConfiguration {
    const configuration = LOCAL_RUNTIME_CONFIGURATIONS[runtimeProfile]
    if (!configuration) throw new Error(`Local Browser Runtime does not support profile ${runtimeProfile}.`)
    return configuration
}

function localRuntimeId(jobId: string): string {
    return `${LOCAL_BROWSER_RUNTIME_PROVIDER}:${jobId}`
}

type LocalRuntimeAssets = {
    root: string
    runnerPath: string
    nodePath: string
    environment: NodeJS.ProcessEnv
}

async function resolveLocalRuntimeAssets(
    definition: SandboxRuntimeCreateOptions['definition'],
    installAiResources = false
): Promise<LocalRuntimeAssets> {
    const configuration = localRuntimeConfiguration(definition.name)
    const packageRoots = [
        path.resolve(process.cwd(), 'packages/sandbox-runtime'),
        path.resolve(__dirname, '../../../../sandbox-runtime')
    ]
    let lastError: unknown
    for (const packageRoot of packageRoots) {
        const root = path.join(packageRoot, 'images', configuration.imageFamily, 'runtime')
        const runnerPath = path.join(packageRoot, 'images', 'browser', 'runtime', 'runner-host.mjs')
        const manifestPath = path.join(root, 'manifest.json')
        try {
            await Promise.all([access(runnerPath, fsConstants.R_OK), access(manifestPath, fsConstants.R_OK)])
        } catch (error) {
            lastError = error
            // Only missing assets warrant trying another source-tree location.
            continue
        }
        const nodePath = await resolveNodeExecutable(definition.expectedManifest.nodeVersion)
        const environmentAdditions: NodeJS.ProcessEnv = {
            XPERT_SANDBOX_RUNTIME_MANIFEST_PATH: manifestPath
        }
        if (configuration.requiresAiResources) {
            const artifactRoot = localAiArtifactRoot(definition.sandboxRuntimeVersion)
            environmentAdditions.XPERT_SANDBOX_RUNTIME_ARTIFACT_ROOT = artifactRoot
            if (installAiResources) {
                await installLocalAiResources({
                    packageRoot,
                    nodePath,
                    artifactRoot,
                    expectedCatalogSha256: definition.expectedManifest.modelCatalogSha256
                })
            }
        }
        if (configuration.requiresFfmpeg) {
            const ffmpegPath = await resolveLocalFfmpeg(packageRoot)
            environmentAdditions.PATH = prependPath(path.dirname(ffmpegPath), process.env.PATH)
        }
        if (configuration.requiresDocumentDependencies) {
            environmentAdditions.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT = await localDocumentDependencyRoot(
                definition.expectedManifest
            )
        }
        if (configuration.requiresPython) {
            const pythonPath = await localDocumentPython(definition.expectedManifest)
            environmentAdditions.PATH = prependPath(path.dirname(pythonPath), process.env.PATH)
        }
        if (configuration.requiresLibreOffice) {
            const sofficePath = await resolveLocalLibreOffice()
            environmentAdditions.PATH = prependPath(
                path.dirname(sofficePath),
                environmentAdditions.PATH ?? process.env.PATH
            )
        }
        return {
            root,
            runnerPath,
            nodePath,
            environment: localRuntimeEnvironment(environmentAdditions)
        }
    }
    throw new Error(
        `Local Browser Runtime assets for ${definition.name} were not found or are incomplete: ${messageOf(lastError)} Run "${configuration.installCommand}" from the Xpert repository.`
    )
}

async function installLocalAiResources(input: {
    packageRoot: string
    nodePath: string
    artifactRoot: string
    expectedCatalogSha256?: string
}): Promise<void> {
    if (!input.expectedCatalogSha256) {
        throw new Error('Browser AI Runtime Definition does not declare modelCatalogSha256.')
    }
    const installerPath = path.join(input.packageRoot, 'scripts', 'install-ai-resources.mjs')
    const catalogPath = path.join(input.packageRoot, 'images', 'browser-ai', 'resources', 'resource-catalog.json')
    await Promise.all([access(installerPath, fsConstants.R_OK), access(catalogPath, fsConstants.R_OK)])
    const result = await runProcess(
        input.nodePath,
        [
            installerPath,
            '--catalog',
            catalogPath,
            '--catalog-sha256',
            input.expectedCatalogSha256,
            '--output',
            input.artifactRoot
        ],
        {
            timeoutMs: 600_000,
            maxOutputBytes: 512 * 1024,
            cwd: input.packageRoot,
            env: localRuntimeEnvironment()
        }
    )
    if (result.exitCode !== 0) {
        throw new Error(
            `${result.output || 'Pinned browser-ai resources could not be installed.'} Run "${LOCAL_AI_INSTALL_COMMAND}" from the Xpert repository to prewarm them.`
        )
    }
}

function localAiArtifactRoot(runtimeSuiteVersion: string): string {
    const cacheRoot = process.env.XDG_CACHE_HOME?.trim() || path.join(homedir(), '.cache')
    return path.join(cacheRoot, 'xpert', 'sandbox-runtime', 'browser-ai', runtimeSuiteVersion, 'artifacts')
}

async function resolveLocalFfmpeg(packageRoot: string): Promise<string> {
    const candidates = [
        path.join(packageRoot, 'node_modules', 'ffmpeg-ffprobe-static', 'ffmpeg'),
        path.resolve(packageRoot, '../../node_modules/ffmpeg-ffprobe-static/ffmpeg')
    ]
    for (const candidate of candidates) {
        try {
            await access(candidate, fsConstants.X_OK)
            return candidate
        } catch {
            // Try the next pnpm layout.
        }
    }
    throw new Error(
        `Local Browser Video Runtime FFmpeg is not installed. Run "${LOCAL_VIDEO_INSTALL_COMMAND}" from the Xpert repository.`
    )
}

async function resolveLocalLibreOffice(): Promise<string> {
    const configuredPath = process.env.XPERT_LOCAL_LIBREOFFICE_PATH?.trim()
    if (configuredPath) {
        await access(configuredPath, fsConstants.X_OK)
        return configuredPath
    }
    const candidates = [
        ...(process.env.PATH ?? '')
            .split(path.delimiter)
            .map((directory) => path.join(directory, process.platform === 'win32' ? 'soffice.exe' : 'soffice')),
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/usr/bin/soffice',
        '/usr/local/bin/soffice'
    ]
    for (const candidate of Array.from(new Set(candidates))) {
        try {
            await access(candidate, fsConstants.X_OK)
            return candidate
        } catch {
            // Try the next platform-standard LibreOffice location.
        }
    }
    throw new Error(LOCAL_DOCUMENT_INSTALL_COMMAND)
}

export async function resolveNodeExecutable(expectedVersion: string | undefined): Promise<string> {
    if (!expectedVersion) throw new Error('Local Browser Runtime Definition does not declare nodeVersion.')
    const executableName = process.platform === 'win32' ? 'node.exe' : 'node'
    const nvmRoot = process.env.NVM_DIR ?? (process.env.HOME ? path.join(process.env.HOME, '.nvm') : undefined)
    const fnmRoot = process.env.FNM_DIR || path.join(homedir(), '.local', 'share', 'fnm')
    const candidates = [
        process.execPath,
        ...(process.env.PATH ?? '').split(path.delimiter).map((directory) => path.join(directory, executableName)),
        ...(nvmRoot ? [path.join(nvmRoot, 'versions', 'node', `v${expectedVersion}`, 'bin', executableName)] : []),
        path.join(fnmRoot, 'node-versions', `v${expectedVersion}`, 'installation', 'bin', executableName),
        ...(process.env.HOME
            ? [path.join(process.env.HOME, '.volta', 'tools', 'image', 'node', expectedVersion, 'bin', executableName)]
            : [])
    ]
    for (const candidate of Array.from(new Set(candidates))) {
        try {
            await access(candidate, fsConstants.X_OK)
            const { stdout } = await execFileAsync(candidate, ['--version'], {
                timeout: 5_000,
                windowsHide: true
            })
            if (stdout.trim() === `v${expectedVersion}`) return candidate
        } catch {
            // Try the next installed Node executable.
        }
    }
    throw new Error(
        `Local Browser Runtime requires Node ${expectedVersion}. Install it with "nvm install ${expectedVersion}" and restart the API.`
    )
}

function prependPath(directory: string, currentPath: string | undefined): string {
    return currentPath ? `${directory}${path.delimiter}${currentPath}` : directory
}

function localRuntimeEnvironment(additions: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const names = [
        'PATH',
        'HOME',
        'TMPDIR',
        'TMP',
        'TEMP',
        'XDG_CACHE_HOME',
        'FONTCONFIG_FILE',
        'FONTCONFIG_PATH',
        'PLAYWRIGHT_BROWSERS_PATH',
        'LANG',
        'LC_ALL',
        'TZ'
    ] as const
    return {
        ...Object.fromEntries(
            names.flatMap((name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]))
        ),
        ...additions
    }
}

function parseStringRecord(value: string, field: string): Record<string, string> {
    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch {
        throw new Error(`${field} is not valid JSON.`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${field} must be an object.`)
    }
    const entries = Object.entries(parsed)
    if (entries.some(([, item]) => typeof item !== 'string')) {
        throw new Error(`${field} must contain string values only.`)
    }
    return Object.fromEntries(entries.map(([key, item]) => [key, String(item)]))
}

function manifestMismatch(expected: Record<string, string>, actual: Record<string, string>): string | null {
    for (const [key, value] of Object.entries(expected)) {
        if (actual[key] !== value) {
            return `Local Browser Runtime manifest mismatch for ${key}: expected ${value}, received ${actual[key] ?? 'missing'}.`
        }
    }
    return null
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
