import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import pdfParse from 'pdf-parse'
import {
    SANDBOX_JOB_PROGRESS_PREFIX,
    SandboxJobRuntimeError,
    type SandboxJobErrorCode,
    type SandboxJobFileInput,
    type SandboxJobOutputRequest,
    type SandboxJobRunInput,
    type SandboxRuntimeDefinition,
    type SandboxRuntimeReadOnlyFile,
    type WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import { VolumeHandle } from '../../shared/volume'
import { RegisteredSandboxAction } from './sandbox-action.registry'
const RUNTIME_JOB_INPUT_SNAPSHOT_DIRECTORY = '.platform/inputs'
const INPUT_SNAPSHOT_COPY_BUFFER_BYTES = 1024 * 1024

export async function createVerifiedReadOnlyInputSnapshot(
    volume: VolumeHandle,
    source: SandboxRuntimeReadOnlyFile['source'],
    file: SandboxJobFileInput,
    index: number
): Promise<SandboxRuntimeReadOnlyFile['source']> {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0
    const nonBlock = typeof fsConstants.O_NONBLOCK === 'number' ? fsConstants.O_NONBLOCK : 0
    const sourceHandle = await open(source.serverPath, fsConstants.O_RDONLY | noFollow | nonBlock)
    const snapshotRelativePath = path.posix.join(
        RUNTIME_JOB_INPUT_SNAPSHOT_DIRECTORY,
        `${String(index).padStart(4, '0')}-${file.sha256.toLowerCase()}.snapshot`
    )
    let snapshotCreated = false
    try {
        const sourceStat = await sourceHandle.stat()
        if (
            !sourceStat.isFile() ||
            sourceStat.size !== source.size ||
            sourceStat.mtimeMs !== source.mtimeMs ||
            sourceStat.dev !== source.device ||
            sourceStat.ino !== source.inode
        ) {
            throw new Error(`Sandbox seekable input changed: ${file.targetPath}`)
        }

        await ensureExactRuntimeJobDirectory(volume, RUNTIME_JOB_INPUT_SNAPSHOT_DIRECTORY)
        const snapshotDirectory = await VolumeHandle.openExistingFile(
            volume.serverRoot,
            RUNTIME_JOB_INPUT_SNAPSHOT_DIRECTORY,
            {
                boundaryRoot: volume.serverRoot,
                flags:
                    fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
            }
        )
        try {
            if (
                !snapshotDirectory.fileStat.isDirectory() ||
                snapshotDirectory.volumeRelativePath !== RUNTIME_JOB_INPUT_SNAPSHOT_DIRECTORY
            ) {
                throw new Error('Sandbox input snapshot directory is invalid')
            }
            const anchoredSnapshotPath = path.join(
                snapshotDirectory.descriptorPath,
                path.basename(snapshotRelativePath)
            )
            const snapshotHandle = await open(
                anchoredSnapshotPath,
                fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollow | nonBlock,
                0o400
            )
            snapshotCreated = true
            try {
                const digest = createHash('sha256')
                const buffer = Buffer.allocUnsafe(INPUT_SNAPSHOT_COPY_BUFFER_BYTES)
                let copiedBytes = 0
                for (;;) {
                    const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, copiedBytes)
                    if (!bytesRead) break
                    if (copiedBytes + bytesRead > file.size) {
                        throw new Error(`Sandbox seekable input changed: ${file.targetPath}`)
                    }
                    digest.update(buffer.subarray(0, bytesRead))
                    let writtenBytes = 0
                    while (writtenBytes < bytesRead) {
                        const result = await snapshotHandle.write(
                            buffer,
                            writtenBytes,
                            bytesRead - writtenBytes,
                            copiedBytes + writtenBytes
                        )
                        if (!result.bytesWritten) {
                            throw new Error('Sandbox input snapshot could not be written')
                        }
                        writtenBytes += result.bytesWritten
                    }
                    copiedBytes += bytesRead
                }
                if (copiedBytes !== file.size || digest.digest('hex') !== file.sha256.toLowerCase()) {
                    throw new Error(`Sandbox seekable input changed: ${file.targetPath}`)
                }
                await snapshotHandle.sync()
                await snapshotHandle.chmod(0o400)
                const snapshotStat = await snapshotHandle.stat()
                if (!snapshotStat.isFile() || snapshotStat.nlink !== 1 || snapshotStat.size !== copiedBytes) {
                    throw new Error('Sandbox input snapshot failed its integrity check')
                }
            } finally {
                await snapshotHandle.close()
            }
        } finally {
            await snapshotDirectory.fileHandle.close()
        }

        const openedSnapshot = await VolumeHandle.openExistingFile(volume.serverRoot, snapshotRelativePath, {
            boundaryRoot: volume.serverRoot,
            flags: fsConstants.O_RDONLY
        })
        try {
            const snapshotStat = openedSnapshot.fileStat
            if (
                !snapshotStat.isFile() ||
                snapshotStat.nlink !== 1 ||
                snapshotStat.size !== file.size ||
                openedSnapshot.volumeRelativePath !== snapshotRelativePath
            ) {
                throw new Error('Sandbox input snapshot failed its integrity check')
            }
            return {
                serverPath: openedSnapshot.filePath,
                hostPath: path.join(volume.hostRoot, openedSnapshot.volumeRelativePath),
                size: snapshotStat.size,
                mtimeMs: snapshotStat.mtimeMs,
                device: snapshotStat.dev,
                inode: snapshotStat.ino
            }
        } finally {
            await openedSnapshot.fileHandle.close()
        }
    } catch (error) {
        if (snapshotCreated) {
            await VolumeHandle.removePath(volume.serverRoot, snapshotRelativePath, {
                boundaryRoot: volume.serverRoot
            }).catch(() => undefined)
        }
        throw error
    } finally {
        await sourceHandle.close()
    }
}

export async function ensureExactRuntimeJobDirectory(volume: VolumeHandle, relativePath: string) {
    const normalizedPath = path.posix.normalize(relativePath.replace(/\\/g, '/').replace(/^\/+/, ''))
    await VolumeHandle.ensureDirectory(volume.serverRoot, normalizedPath, volume.serverRoot)
    const openedDirectory = await VolumeHandle.openExistingFile(volume.serverRoot, normalizedPath, {
        boundaryRoot: volume.serverRoot,
        flags: fsConstants.O_RDONLY | (typeof fsConstants.O_DIRECTORY === 'number' ? fsConstants.O_DIRECTORY : 0)
    })
    try {
        if (!openedDirectory.fileStat.isDirectory() || openedDirectory.volumeRelativePath !== normalizedPath) {
            throw new Error('Sandbox runtime-job directory failed its integrity check')
        }
    } finally {
        await openedDirectory.fileHandle.close()
    }
}

export function validateInputFiles(files: readonly SandboxJobFileInput[], tenantId: string): void {
    const targetPaths = new Set<string>()
    for (const file of files) {
        const targetPath = validateInputFile(file, tenantId)
        if (targetPaths.has(targetPath)) throw new Error(`Sandbox input targetPath is duplicated: ${targetPath}`)
        targetPaths.add(targetPath)
    }
}

export function validateInputFile(file: SandboxJobFileInput, tenantId: string): string {
    const targetPath = validateRelativePath(file.targetPath, 'input targetPath')
    if (targetPath === 'job.json') throw new Error('Sandbox input targetPath is reserved by Core.')
    if (file.access && file.access !== 'materialized' && file.access !== 'read-only-seekable') {
        throw new Error('Sandbox input access mode is invalid.')
    }
    if (!Number.isInteger(file.size) || file.size <= 0)
        throw new Error('Sandbox input size must be a positive integer.')
    if (!/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error('Sandbox input sha256 is invalid.')
    if (file.reference.source !== 'platform.workspace.files')
        throw new Error('Sandbox input must use a portable workspace reference.')
    if (file.reference.tenantId !== tenantId) throw new Error('Sandbox input reference belongs to another tenant.')
    return targetPath
}

export function hasReadOnlySeekableInputs(input: SandboxJobRunInput): boolean {
    return input.files?.some((file) => file.access === 'read-only-seekable') ?? false
}

export function validateOutputRequest(output: SandboxJobOutputRequest, tenantId: string): void {
    validateRelativePath(output.path, 'output path')
    requiredText(output.originalName, 'output originalName')
    requiredText(output.mimeType, 'output mimeType')
    requiredText(output.destination.folder, 'output destination.folder')
    if (output.destination.tenantId !== tenantId)
        throw new Error('Sandbox output destination belongs to another tenant.')
}

export function validateRelativePath(value: string, field: string): string {
    const normalized = value.replace(/\\/g, '/')
    if (!normalized || normalized.includes('\0') || path.posix.isAbsolute(normalized))
        throw new Error(`Sandbox ${field} is invalid.`)
    const clean = path.posix.normalize(normalized)
    if (clean === '.' || clean === '..' || clean.startsWith('../')) throw new Error(`Sandbox ${field} is invalid.`)
    return clean
}

export function workspacePath(workspaceRoot: string, area: 'input' | 'output', relativePath: string): string {
    const safe = validateRelativePath(relativePath, `${area} path`)
    return workspaceRoot.startsWith('/')
        ? path.posix.join(workspaceRoot, area, safe)
        : path.join(workspaceRoot, area, safe)
}

export function runtimePath(workspaceRoot: string, area: 'action' | '', relativePath: string): string {
    const safe = validateRelativePath(relativePath, 'runtime path')
    const parts = area ? ['runtime', area, safe] : ['runtime', safe]
    return workspaceRoot.startsWith('/') ? path.posix.join(workspaceRoot, ...parts) : path.join(workspaceRoot, ...parts)
}

/** Builds the only argv Core permits a Provider instance to execute for an Action. */
export function buildRunnerCommand(definition: SandboxRuntimeDefinition, workspaceRoot: string): string[] {
    const requestPath = workspacePath(workspaceRoot, 'input', 'job.json')
    const outputPath = workspaceRoot.startsWith('/')
        ? path.posix.join(workspaceRoot, 'output')
        : path.join(workspaceRoot, 'output')
    const actionRoot = workspaceRoot.startsWith('/')
        ? path.posix.join(workspaceRoot, 'runtime', 'action')
        : path.join(workspaceRoot, 'runtime', 'action')
    const actionManifest = runtimePath(workspaceRoot, '', 'action-manifest.json')
    return [
        ...definition.command,
        '--request',
        requestPath,
        '--output',
        outputPath,
        '--action-root',
        actionRoot,
        '--action-manifest',
        actionManifest
    ]
}

/** Returns a deterministic incompatibility reason before any Runtime is created. */
export function actionCompatibilityError(
    action: RegisteredSandboxAction,
    definition: SandboxRuntimeDefinition
): string | null {
    if (action.runtimeContractVersion !== definition.contractVersion) {
        return `Sandbox Action contract ${action.runtimeContractVersion} does not match Runtime Profile contract ${definition.contractVersion}.`
    }
    const runtimePlaywright = definition.expectedManifest.playwrightVersion
    if (action.playwrightVersion && action.playwrightVersion !== runtimePlaywright) {
        return `Sandbox Action Playwright ${action.playwrightVersion} does not match Runtime Profile Playwright ${runtimePlaywright ?? 'unspecified'}.`
    }
    return null
}

/** Performs structural validation before an output is persisted to Workspace Files. */
export async function validateOutput(buffer: Buffer, mimeType: string): Promise<void> {
    if (mimeType === 'application/pdf') {
        if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
            throw new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', 'PDF header is invalid.', false)
        const parsed = await pdfParse(buffer).catch(() => null)
        if (!parsed?.numpages)
            throw new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', 'PDF contains no readable pages.', false)
        return
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        if (buffer[0] !== 0x50 || buffer[1] !== 0x4b)
            throw new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', 'PPTX ZIP header is invalid.', false)
        const zip = await JSZip.loadAsync(buffer).catch(() => null)
        if (!zip?.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) {
            throw new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', 'PPTX package structure is invalid.', false)
        }
        if (!Object.keys(zip.files).some((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))) {
            throw new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', 'PPTX contains no slides.', false)
        }
    }
}

export function portableReference(
    written: {
        filePath: string
        workspacePath: string
        catalog: SandboxJobOutputRequest['destination']['catalog']
        scopeId?: string
        size?: number
    },
    request: SandboxJobOutputRequest
): WorkspacePortableFileReference {
    return {
        source: 'platform.workspace.files',
        filePath: written.filePath,
        workspacePath: written.workspacePath,
        catalog: written.catalog,
        scopeId: written.scopeId,
        tenantId: request.destination.tenantId,
        userId: request.destination.userId,
        projectId: request.destination.projectId,
        knowledgeId: request.destination.knowledgeId,
        rootId: request.destination.rootId,
        xpertId: request.destination.xpertId,
        isolateByUser: request.destination.isolateByUser,
        originalName: request.originalName,
        name: request.originalName,
        mimeType: request.mimeType,
        size: written.size
    }
}

export function classifyRunnerFailure(output: string, jobId: string): SandboxJobRuntimeError {
    const normalized = output.toUpperCase()
    if (normalized.includes('SANDBOX_ACTION_INVALID')) {
        return new SandboxJobRuntimeError('SANDBOX_ACTION_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('EXPORT_MEDIA_FAILED')) {
        return new SandboxJobRuntimeError('EXPORT_MEDIA_FAILED', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('EXPORT_OUTPUT_INVALID')) {
        return new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('EXPORT_INPUT_INVALID') || normalized.includes('GOAL SPEC VALIDATION FAILED')) {
        return new SandboxJobRuntimeError('EXPORT_INPUT_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('BROWSER_LAUNCH_FAILED') || normalized.includes('CHROMIUM')) {
        return new SandboxJobRuntimeError('BROWSER_LAUNCH_FAILED', truncateSandboxRunnerOutput(output), true, jobId)
    }
    if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) {
        return new SandboxJobRuntimeError('EXPORT_OOM', truncateSandboxRunnerOutput(output), true, jobId)
    }
    return new SandboxJobRuntimeError(
        'SANDBOX_START_FAILED',
        truncateSandboxRunnerOutput(output) || 'Sandbox runner failed.',
        true,
        jobId
    )
}

export function normalizeRuntimeError(error: unknown, jobId: string): SandboxJobRuntimeError {
    return error instanceof SandboxJobRuntimeError
        ? error
        : new SandboxJobRuntimeError('SANDBOX_START_FAILED', messageOf(error), true, jobId)
}

export function isRetryableCode(code?: SandboxJobErrorCode | null): boolean {
    return (
        code === 'SANDBOX_CAPACITY_UNAVAILABLE' ||
        code === 'SANDBOX_START_FAILED' ||
        code === 'BROWSER_LAUNCH_FAILED' ||
        code === 'EXPORT_TIMEOUT' ||
        code === 'EXPORT_OOM'
    )
}

export function normalizeTimeout(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}

export function requiredText(value: string, field: string): string {
    const normalized = value?.trim()
    if (!normalized) throw new Error(`Sandbox job ${field} is required.`)
    return normalized
}

export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function truncateSandboxRunnerOutput(value: string): string {
    const normalized = withoutSandboxProgress(value).trim()
    const limit = 4_000
    if (normalized.length <= limit) return normalized

    const marker = '\n...[middle of runner output omitted]...\n'
    const available = limit - marker.length
    const headLength = Math.floor(available * 0.45)
    return `${normalized.slice(0, headLength)}${marker}${normalized.slice(-(available - headLength))}`
}

export function withoutSandboxProgress(value: string): string {
    return value
        .split(/\r?\n/)
        .map((line) => {
            const marker = line.indexOf(SANDBOX_JOB_PROGRESS_PREFIX)
            return marker < 0 ? line : line.slice(0, marker).trimEnd()
        })
        .filter(Boolean)
        .join('\n')
}

export function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function capacityPollInterval(): number {
    return Math.max(250, positiveInteger(process.env.SANDBOX_JOB_CAPACITY_POLL_MS, 1_000))
}

export function artifactDigest(reference: string, configured?: string): string | undefined {
    if (configured) return configured.toLowerCase()
    return reference.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase()
}

export function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}
