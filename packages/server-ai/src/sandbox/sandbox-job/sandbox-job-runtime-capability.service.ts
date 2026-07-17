import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import JSZip from 'jszip'
import pdfParse from 'pdf-parse'
import { In, LessThan, Repository } from 'typeorm'
import {
    SandboxJobRuntimeError,
    SandboxRuntimeProviderRegistry,
    type SandboxJobErrorCode,
    type SandboxJobFileInput,
    type SandboxJobOutput,
    type SandboxJobOutputRequest,
    type SandboxJobActionHealth,
    type SandboxJobRunInput,
    type SandboxJobRunResult,
    type SandboxJobsApi,
    type SandboxJobSnapshot,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDefinition,
    type SandboxRuntimeInstance,
    type SandboxRuntimeReadOnlyFile,
    type WorkspacePortableFileReference,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { SandboxJobCapacityService, type SandboxJobCapacityLease } from './sandbox-job-capacity.service'
import { SandboxJobEntity } from './sandbox-job.entity'
import { RegisteredSandboxAction, SandboxActionRegistry } from './sandbox-action.registry'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'
import {
    SandboxRuntimeBindingSelector,
    type SandboxRuntimeResolution
} from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeHealthService } from './sandbox-runtime-health.service'

const CLEANUP_INTERVAL_MS = 60_000
const WAITING_HEARTBEAT_INTERVAL_MS = 30_000
const WAITING_HEARTBEAT_TTL_MS = 120_000
const MAX_JOB_INPUT_BYTES = 350 * 1024 * 1024
const MAX_JOB_OUTPUT_BYTES = 350 * 1024 * 1024

type ActiveSandbox = {
    runtime: SandboxRuntimeInstance
    resolution: SandboxRuntimeResolution
}

/**
 * Core implementation of the Action-oriented Sandbox Jobs API.
 *
 * It owns idempotency, capacity, action/input materialization, output validation,
 * runtime evidence, and cleanup. The API process owns Runtime selection,
 * instance creation, cancellation, and orphan cleanup for every execution pool.
 */
@Injectable()
export class SandboxJobRuntimeCapabilityService implements SandboxJobsApi, OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SandboxJobRuntimeCapabilityService.name)
    private readonly active = new Map<string, ActiveSandbox>()
    private cleanupTimer?: ReturnType<typeof setInterval>

    constructor(
        @InjectRepository(SandboxJobEntity)
        private readonly repository: Repository<SandboxJobEntity>,
        private readonly definitions: SandboxRuntimeDefinitionRegistry,
        private readonly actions: SandboxActionRegistry,
        private readonly providers: SandboxRuntimeProviderRegistry,
        private readonly bindingSelector: SandboxRuntimeBindingSelector,
        private readonly runtimeHealth: SandboxRuntimeHealthService,
        private readonly workspaceFiles: WorkspaceFilesRuntimeCapabilityService,
        private readonly capacity: SandboxJobCapacityService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    onModuleInit(): void {
        void this.cleanupOrphans()
        this.cleanupTimer = setInterval(() => void this.cleanupOrphans(), CLEANUP_INTERVAL_MS)
        this.cleanupTimer.unref()
    }

    onModuleDestroy(): void {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    }

    /**
     * Reuses prior success, reattaches active work, or executes a new attempt
     * after resolving a trusted Action, Definition, and healthy Binding.
     */
    async run(input: SandboxJobRunInput): Promise<SandboxJobRunResult> {
        const { action, definition } = await this.requireRunnableAction(input)
        let job = await this.findIdempotent(input.scope.tenantId, input.idempotencyKey)
        if (job?.status === 'succeeded') return this.toSucceeded(job)
        if (job && (job.status === 'waiting' || job.status === 'starting' || job.status === 'running')) {
            try {
                return await this.waitForAttachedJob(job.id as string, definition.hardDeadlineMs)
            } catch (error) {
                const current = await this.repository.findOne({ where: { id: job.id as string } })
                if (!(error instanceof SandboxJobRuntimeError) || current?.status !== 'lost') throw error
                return this.run(input)
            }
        }
        if (job?.cleanupPending) await this.requirePreviousAttemptCleanup(job)
        const resolution = await this.bindingSelector.require(definition, job?.id as string | undefined, {
            readOnlyFileMounts: hasReadOnlySeekableInputs(input)
        })
        const prepared = await this.prepareAttempt(job, input, action, definition, resolution)
        if (prepared.attached) return this.waitForAttachedJob(prepared.job.id as string, definition.hardDeadlineMs)
        job = prepared.job
        const jobId = job.id as string
        const lease = await this.waitForCapacity(job, input, definition)

        try {
            return await this.execute(job, input, action, definition, resolution)
        } finally {
            await this.capacity.release(lease).catch((error) => {
                this.logger.warn(`Failed to release sandbox job capacity lease ${jobId}: ${messageOf(error)}`)
            })
        }
    }

    /** Cancels tenant-scoped state, terminates an active Runtime, and schedules cleanup evidence. */
    async cancel(input: { jobId: string }): Promise<SandboxJobSnapshot> {
        const job = await this.findTenantScopedJob(input.jobId)
        if (!job)
            throw new SandboxJobRuntimeError('SANDBOX_CANCELLED', 'Sandbox job was not found.', false, input.jobId)
        const active = this.active.get(input.jobId)
        if (active?.runtime.terminate) await Promise.resolve(active.runtime.terminate()).catch(() => undefined)
        job.status = 'cancelled'
        job.errorCode = 'SANDBOX_CANCELLED'
        job.errorMessage = 'Sandbox job was cancelled.'
        job.finishedAt = new Date()
        await this.repository.save(job)
        const cleaned = await this.destroySandbox(job, active?.resolution)
        if (cleaned) await this.cleanupVolume(job)
        return this.toSnapshot(job)
    }

    /** Reads a Job only within the current tenant context. */
    async getJob(input: { jobId: string }): Promise<SandboxJobSnapshot | null> {
        const job = await this.findTenantScopedJob(input.jobId)
        return job ? this.toSnapshot(job) : null
    }

    /**
     * Public capability methods must never resolve a job outside the active tenant.
     * Internal lifecycle paths already hold a trusted SandboxJobEntity and therefore
     * do not use this lookup helper.
     */
    private async findTenantScopedJob(jobId: string): Promise<SandboxJobEntity | null> {
        const tenantId = RequestContext.currentTenantId()
        if (!tenantId) return null
        return this.repository.findOne({ where: { id: jobId, tenantId } })
    }

    /** Aggregates Action compatibility with API-local Runtime readiness. */
    async getActionHealth(input: {
        pluginName: string
        action: string
        actionVersion: string
    }): Promise<SandboxJobActionHealth> {
        const base = { pluginName: input.pluginName, action: input.action, actionVersion: input.actionVersion }
        let action: RegisteredSandboxAction | null
        try {
            action = await this.actions.get(input)
        } catch (error) {
            return {
                ...base,
                available: false,
                reason: 'ACTION_INVALID',
                message: messageOf(error)
            }
        }
        if (!action) return { ...base, available: false, reason: 'ACTION_MISSING' }
        const definition = this.definitions.get(action.runtimeProfile)
        if (!definition)
            return { ...base, runtimeProfile: action.runtimeProfile, available: false, reason: 'PROFILE_MISSING' }
        const identity = {
            ...base,
            runtimeProfile: definition.name,
            sandboxRuntimeVersion: definition.sandboxRuntimeVersion
        }
        const compatibility = actionCompatibilityError(action, definition)
        if (compatibility) return { ...identity, available: false, reason: 'VERSION_MISMATCH', message: compatibility }
        const health = await this.runtimeHealth.getProfileHealth(definition)
        return {
            ...identity,
            available: health.available,
            ...(!health.available ? { reason: health.reason ?? 'PROFILE_UNHEALTHY' } : {}),
            ...(health.message ? { message: health.message } : {}),
            ...(health.provider ? { provider: health.provider } : {}),
            ...(health.runtimeBindingId ? { runtimeBindingId: health.runtimeBindingId } : {}),
            ...(health.artifactDigest ? { artifactDigest: health.artifactDigest } : {}),
            ...(health.manifest ? { manifest: health.manifest } : {})
        }
    }

    private async requireRunnableAction(input: SandboxJobRunInput): Promise<{
        action: RegisteredSandboxAction
        definition: SandboxRuntimeDefinition
    }> {
        requiredText(input.action, 'action')
        requiredText(input.actionVersion, 'actionVersion')
        let action: RegisteredSandboxAction | null
        try {
            action = await this.actions.get({
                pluginName: input.scope.pluginName,
                action: input.action,
                actionVersion: input.actionVersion
            })
        } catch (error) {
            throw new SandboxJobRuntimeError('SANDBOX_ACTION_INVALID', messageOf(error), false)
        }
        if (!action) {
            throw new SandboxJobRuntimeError(
                'SANDBOX_ACTION_UNAVAILABLE',
                `Sandbox Action ${input.scope.pluginName}:${input.action}@${input.actionVersion} is unavailable.`,
                false
            )
        }
        const definition = this.definitions.get(action.runtimeProfile)
        if (!definition) {
            throw new SandboxJobRuntimeError(
                'SANDBOX_PROFILE_UNAVAILABLE',
                `Sandbox Runtime profile ${action.runtimeProfile} is unavailable.`,
                false
            )
        }
        const compatibility = actionCompatibilityError(action, definition)
        if (compatibility) throw new SandboxJobRuntimeError('SANDBOX_VERSION_MISMATCH', compatibility, false)
        try {
            requiredText(input.scope.tenantId, 'scope.tenantId')
            const tenantId = RequestContext.currentTenantId()
            if (!tenantId || tenantId !== input.scope.tenantId) {
                throw new Error('Sandbox job scope must match the active tenant context.')
            }
            requiredText(input.scope.pluginName, 'scope.pluginName')
            requiredText(input.scope.businessResourceType, 'scope.businessResourceType')
            requiredText(input.scope.businessResourceId, 'scope.businessResourceId')
            requiredText(input.idempotencyKey, 'idempotencyKey')
            validateInputFiles(input.files ?? [], input.scope.tenantId)
            if (!Array.isArray(input.outputs) || !input.outputs.length)
                throw new Error('Sandbox job outputs are required.')
            input.outputs.forEach((output) => validateOutputRequest(output, input.scope.tenantId))
        } catch (error) {
            throw new SandboxJobRuntimeError('EXPORT_INPUT_INVALID', messageOf(error), false)
        }
        return { action, definition }
    }

    private async prepareAttempt(
        existing: SandboxJobEntity | null,
        input: SandboxJobRunInput,
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition,
        resolution: SandboxRuntimeResolution
    ): Promise<{ job: SandboxJobEntity; attached: boolean }> {
        const job = existing ?? this.repository.create()
        if (!existing && input.jobId) job.id = input.jobId
        job.tenantId = input.scope.tenantId
        job.organizationId = input.scope.organizationId ?? undefined
        job.userId = input.scope.userId ?? null
        job.runtimeProfile = definition.name
        job.sandboxRuntimeVersion = definition.sandboxRuntimeVersion
        job.action = action.name
        job.actionVersion = action.version
        job.idempotencyKey = input.idempotencyKey
        job.pluginName = input.scope.pluginName
        job.businessResourceType = input.scope.businessResourceType
        job.businessResourceId = input.scope.businessResourceId
        job.provider = resolution.provider.type
        job.runtimeBindingId = resolution.binding.id
        job.runtimeArtifactKind = resolution.binding.artifact.kind
        job.runtimeArtifactReference = resolution.binding.artifact.reference
        job.runtimeArtifactDigest =
            artifactDigest(resolution.binding.artifact.reference, resolution.binding.artifact.digest) ?? null
        job.status = 'waiting'
        job.attempt = (existing?.attempt ?? 0) + 1
        job.runtimeRef = null
        job.containerRef = null
        job.cleanupPending = false
        job.cleanedAt = null
        job.outputs = []
        job.errorCode = null
        job.errorMessage = null
        job.startedAt = null
        job.finishedAt = null
        job.hardDeadlineAt = new Date(Date.now() + WAITING_HEARTBEAT_TTL_MS)
        try {
            return { job: await this.repository.save(job), attached: false }
        } catch (error) {
            if (existing) throw error
            const concurrent = await this.findIdempotent(input.scope.tenantId, input.idempotencyKey)
            if (!concurrent) throw error
            return { job: concurrent, attached: true }
        }
    }

    private async waitForCapacity(
        job: SandboxJobEntity,
        input: SandboxJobRunInput,
        definition: SandboxRuntimeDefinition
    ): Promise<SandboxJobCapacityLease> {
        const jobId = job.id as string
        let lastCapacityMessage: string | null = null
        let nextHeartbeatAt = 0
        while (true) {
            const current = await this.repository.findOne({ where: { id: jobId } })
            if (!current || current.status === 'cancelled') {
                throw new SandboxJobRuntimeError(
                    'SANDBOX_CANCELLED',
                    'Sandbox job was cancelled while waiting for capacity.',
                    false,
                    jobId
                )
            }
            if (current.status === 'lost') {
                throw new SandboxJobRuntimeError(
                    'SANDBOX_START_FAILED',
                    current.errorMessage ?? 'Sandbox job ownership was lost.',
                    true,
                    jobId
                )
            }
            try {
                return await this.capacity.acquire({
                    jobId,
                    tenantId: input.scope.tenantId,
                    userId: input.scope.userId,
                    durationMs: definition.hardDeadlineMs + 60_000
                })
            } catch (error) {
                if (!(error instanceof SandboxJobRuntimeError) || error.code !== 'SANDBOX_CAPACITY_UNAVAILABLE')
                    throw error
                if (lastCapacityMessage !== error.message || Date.now() >= nextHeartbeatAt) {
                    current.status = 'waiting'
                    current.errorCode = error.code
                    current.errorMessage = error.message
                    current.hardDeadlineAt = new Date(Date.now() + WAITING_HEARTBEAT_TTL_MS)
                    await this.repository.save(current)
                    lastCapacityMessage = error.message
                    nextHeartbeatAt = Date.now() + WAITING_HEARTBEAT_INTERVAL_MS
                }
                await wait(capacityPollInterval())
            }
        }
    }

    private async execute(
        job: SandboxJobEntity,
        input: SandboxJobRunInput,
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition,
        resolution: SandboxRuntimeResolution
    ): Promise<SandboxJobRunResult> {
        const jobId = job.id as string
        const volume = await this.volumeClient
            .resolve({ tenantId: input.scope.tenantId, catalog: 'runtime-jobs', jobId })
            .ensureRoot()
        let runtime: SandboxRuntimeInstance | undefined
        try {
            job.status = 'starting'
            job.startedAt = new Date()
            job.hardDeadlineAt = new Date(Date.now() + definition.hardDeadlineMs)
            job.errorCode = null
            job.errorMessage = null
            await this.repository.save(job)
            const readOnlyFiles = await this.prepareReadOnlyInputs(input, volume)
            const createOptions: SandboxRuntimeCreateOptions = {
                ephemeral: true,
                tenantId: input.scope.tenantId,
                workFor: { type: 'job', id: jobId },
                definition,
                binding: resolution.binding,
                volume: { serverRoot: volume.serverRoot, hostRoot: volume.hostRoot },
                resources: definition.resources,
                networkPolicy: definition.networkPolicy,
                security: definition.security,
                hardDeadlineMs: definition.hardDeadlineMs,
                ...(readOnlyFiles.length ? { readOnlyFiles } : {})
            }
            runtime = await resolution.provider.create(createOptions)
            this.active.set(jobId, { runtime, resolution })
            job.runtimeRef = runtime.id
            job.cleanupPending = true
            job.status = 'running'
            await this.repository.save(job)

            await this.materializeAction(runtime, runtime.workspaceRoot, action)
            await this.materializeInputs(runtime, runtime.workspaceRoot, input, action, definition)
            const timeoutMs = Math.min(
                normalizeTimeout(input.timeoutMs, definition.timeoutMs),
                definition.hardDeadlineMs
            )
            const response = await runtime.execute(buildRunnerCommand(definition, runtime.workspaceRoot), {
                timeoutMs,
                maxOutputBytes: 4 * 1024 * 1024
            })
            if (response.timedOut) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_TIMEOUT',
                    `Sandbox export timed out after ${timeoutMs}ms.`,
                    true,
                    jobId
                )
            }
            if (response.terminationReason === 'oom') {
                throw new SandboxJobRuntimeError(
                    'EXPORT_OOM',
                    'Sandbox export was terminated by the memory limit.',
                    true,
                    jobId
                )
            }
            if (response.terminationReason === 'deadline') {
                throw new SandboxJobRuntimeError(
                    'EXPORT_TIMEOUT',
                    'Sandbox export exceeded its hard deadline.',
                    true,
                    jobId
                )
            }
            if (response.terminationReason === 'cancelled') {
                throw new SandboxJobRuntimeError('SANDBOX_CANCELLED', 'Sandbox export was cancelled.', false, jobId)
            }
            if (response.exitCode !== 0) throw classifyRunnerFailure(response.output, jobId)
            await this.assertReadOnlyInputsUnchanged(readOnlyFiles, jobId)
            const outputs = await this.collectOutputs(runtime, runtime.workspaceRoot, input.outputs)
            job.outputs = outputs
            job.status = 'succeeded'
            job.errorCode = null
            job.errorMessage = null
            job.finishedAt = new Date()
            await this.repository.save(job)
            return this.toSucceeded(job)
        } catch (error) {
            const persisted = await this.repository.findOne({ where: { id: jobId } })
            const runtimeError =
                persisted?.status === 'cancelled'
                    ? new SandboxJobRuntimeError(
                          'SANDBOX_CANCELLED',
                          persisted.errorMessage ?? 'Sandbox job was cancelled.',
                          false,
                          jobId
                      )
                    : normalizeRuntimeError(error, jobId)
            if (persisted?.status === 'cancelled') {
                job = persisted
                throw runtimeError
            }
            job.status = runtimeError.code === 'SANDBOX_CANCELLED' ? 'cancelled' : 'failed'
            job.errorCode = runtimeError.code
            job.errorMessage = runtimeError.message
            job.finishedAt = new Date()
            await this.repository.save(job)
            throw runtimeError
        } finally {
            this.active.delete(jobId)
            const cleaned = await this.destroySandbox(job, resolution)
            if (cleaned) await this.cleanupVolume(job)
        }
    }

    private async materializeInputs(
        backend: SandboxRuntimeInstance,
        workspaceRoot: string,
        input: SandboxJobRunInput,
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition
    ): Promise<void> {
        const uploads: Array<[string, Uint8Array]> = []
        const materializedFiles = (input.files ?? []).filter((file) => file.access !== 'read-only-seekable')
        const declaredBytes = materializedFiles.reduce((total, file) => total + file.size, 0)
        if (declaredBytes > MAX_JOB_INPUT_BYTES) {
            throw new SandboxJobRuntimeError(
                'EXPORT_INPUT_INVALID',
                'Sandbox materialized inputs exceed the allowed size.',
                false
            )
        }
        let totalBytes = 0
        for (const file of materializedFiles) {
            const read = await this.workspaceFiles.readBuffer(file.reference).catch((error) => {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    `Unable to read ${file.targetPath}: ${messageOf(error)}`,
                    false
                )
            })
            const digest = createHash('sha256').update(read.buffer).digest('hex')
            if (read.buffer.length !== file.size || digest !== file.sha256) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    `Sandbox input changed: ${file.targetPath}`,
                    false
                )
            }
            totalBytes += read.buffer.length
            if (totalBytes > MAX_JOB_INPUT_BYTES) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    'Sandbox job inputs exceed the allowed size.',
                    false
                )
            }
            uploads.push([workspacePath(workspaceRoot, 'input', file.targetPath), read.buffer])
        }
        const request = Buffer.from(
            JSON.stringify({
                contractVersion: definition.contractVersion,
                runtimeProfile: definition.name,
                sandboxRuntimeVersion: definition.sandboxRuntimeVersion,
                action: action.name,
                actionVersion: action.version,
                payload: input.payload
            })
        )
        uploads.unshift([workspacePath(workspaceRoot, 'input', 'job.json'), request])
        const results = await backend.uploadFiles(uploads)
        const failed = results.find((result) => result.error)
        if (failed)
            throw new SandboxJobRuntimeError(
                'EXPORT_INPUT_INVALID',
                `Failed to materialize ${failed.path}: ${failed.error}`,
                false
            )
    }

    /**
     * Resolve seekable inputs before Provider creation. Core keeps the portable
     * reference and host paths on the trusted side of the Runtime boundary;
     * only the exact target alias becomes visible inside the Job workspace.
     */
    private async prepareReadOnlyInputs(
        input: SandboxJobRunInput,
        volume: ReturnType<VolumeClient['resolve']>
    ): Promise<SandboxRuntimeReadOnlyFile[]> {
        const files: SandboxRuntimeReadOnlyFile[] = []
        for (const file of input.files ?? []) {
            if (file.access !== 'read-only-seekable') continue
            const source = await this.workspaceFiles.resolveReadOnlyFileSource(file.reference).catch((error) => {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    `Unable to resolve seekable input ${file.targetPath}: ${messageOf(error)}`,
                    false
                )
            })
            if (source.size !== file.size) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    `Sandbox seekable input changed: ${file.targetPath}`,
                    false
                )
            }
            const targetPath = path.posix.join('input', validateRelativePath(file.targetPath, 'input targetPath'))
            await mkdir(path.dirname(volume.path(targetPath)), { recursive: true })
            files.push({ source, targetPath, size: file.size, sha256: file.sha256 })
        }
        return files
    }

    /** Reject successful output when a mounted Workspace file changed in place. */
    private async assertReadOnlyInputsUnchanged(
        files: readonly SandboxRuntimeReadOnlyFile[],
        jobId: string
    ): Promise<void> {
        for (const file of files) {
            const current = await stat(file.source.serverPath).catch(() => null)
            if (
                !current?.isFile() ||
                current.size !== file.source.size ||
                current.mtimeMs !== file.source.mtimeMs ||
                current.dev !== file.source.device ||
                current.ino !== file.source.inode
            ) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_INPUT_INVALID',
                    `Sandbox seekable input changed during execution: ${file.targetPath}`,
                    false,
                    jobId
                )
            }
        }
    }

    private async materializeAction(
        backend: SandboxRuntimeInstance,
        workspaceRoot: string,
        action: RegisteredSandboxAction
    ): Promise<void> {
        const uploads: Array<[string, Uint8Array]> = []
        const bundle = await this.actions.getCachedBundle(action).catch((error) => {
            throw new SandboxJobRuntimeError('SANDBOX_ACTION_INVALID', messageOf(error), false)
        })
        for (const file of bundle) {
            uploads.push([runtimePath(workspaceRoot, 'action', file.relativePath), file.content])
        }
        const actionManifest = Buffer.from(
            JSON.stringify({
                name: action.name,
                version: action.version,
                runtimeContractVersion: action.runtimeContractVersion,
                ...(action.playwrightVersion ? { playwrightVersion: action.playwrightVersion } : {}),
                entrypoint: action.entrypoint,
                bundleSha256: action.bundleSha256
            })
        )
        uploads.unshift([runtimePath(workspaceRoot, '', 'action-manifest.json'), actionManifest])
        const results = await backend.uploadFiles(uploads)
        const failed = results.find((result) => result.error)
        if (failed) {
            throw new SandboxJobRuntimeError(
                'SANDBOX_ACTION_INVALID',
                `Failed to materialize Sandbox Action ${failed.path}: ${failed.error}`,
                false
            )
        }
    }

    private async collectOutputs(
        backend: SandboxRuntimeInstance,
        workspaceRoot: string,
        requests: SandboxJobOutputRequest[]
    ): Promise<SandboxJobOutput[]> {
        const sandboxPaths = requests.map((request) => workspacePath(workspaceRoot, 'output', request.path))
        const downloads = await backend.downloadFiles(sandboxPaths)
        const outputs: SandboxJobOutput[] = []
        let totalBytes = 0
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index]
            const downloaded = downloads[index]
            if (!downloaded || downloaded.error || !downloaded.content?.length) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_OUTPUT_INVALID',
                    `Sandbox output is missing: ${request.path}`,
                    false
                )
            }
            const buffer = Buffer.from(downloaded.content)
            totalBytes += buffer.length
            if (totalBytes > MAX_JOB_OUTPUT_BYTES) {
                throw new SandboxJobRuntimeError(
                    'EXPORT_OUTPUT_INVALID',
                    'Sandbox job outputs exceed the allowed size.',
                    false
                )
            }
            await validateOutput(buffer, request.mimeType)
            const written = await this.workspaceFiles.uploadBuffer({
                ...request.destination,
                buffer,
                originalName: request.originalName,
                mimeType: request.mimeType,
                size: buffer.length,
                folder: request.destination.folder
            })
            outputs.push({
                path: request.path,
                originalName: request.originalName,
                mimeType: request.mimeType,
                size: buffer.length,
                sha256: createHash('sha256').update(buffer).digest('hex'),
                reference: portableReference(written, request),
                ...(written.fileUrl ? { fileUrl: written.fileUrl } : {}),
                ...(written.workspacePath ? { workspacePath: written.workspacePath } : {})
            })
        }
        return outputs
    }

    private async waitForAttachedJob(jobId: string, timeoutMs: number): Promise<SandboxJobRunResult> {
        let deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            const current = await this.repository.findOne({ where: { id: jobId } })
            if (!current)
                throw new SandboxJobRuntimeError(
                    'SANDBOX_START_FAILED',
                    'Attached sandbox job disappeared.',
                    true,
                    jobId
                )
            if (current.status === 'succeeded') return this.toSucceeded(current)
            if (current.status === 'waiting') deadline = Date.now() + timeoutMs
            if (current.status === 'failed' || current.status === 'cancelled' || current.status === 'lost') {
                throw new SandboxJobRuntimeError(
                    current.errorCode ?? 'SANDBOX_START_FAILED',
                    current.errorMessage ?? `Sandbox job ended with status ${current.status}.`,
                    isRetryableCode(current.errorCode),
                    jobId
                )
            }
            await wait(500)
        }
        throw new SandboxJobRuntimeError(
            'EXPORT_TIMEOUT',
            'Timed out waiting for the existing sandbox job.',
            true,
            jobId
        )
    }

    private findIdempotent(tenantId: string, idempotencyKey: string): Promise<SandboxJobEntity | null> {
        return this.repository.findOne({ where: { tenantId, idempotencyKey } })
    }

    private async requirePreviousAttemptCleanup(job: SandboxJobEntity): Promise<void> {
        const cleaned = await this.destroySandbox(job)
        if (!cleaned) {
            throw new SandboxJobRuntimeError(
                'SANDBOX_START_FAILED',
                'The previous Sandbox Runtime attempt is still awaiting cleanup.',
                true,
                job.id as string
            )
        }
        await this.cleanupVolume(job)
    }

    private async destroySandbox(job: SandboxJobEntity, resolution?: SandboxRuntimeResolution): Promise<boolean> {
        const runtimeRef = job.runtimeRef ?? job.containerRef
        const providerType = resolution?.provider.type ?? job.provider
        if (!runtimeRef && !providerType) {
            job.cleanupPending = false
            job.cleanedAt ??= new Date()
            await this.repository.save(job)
            return true
        }
        if (!providerType) {
            job.cleanupPending = true
            job.cleanedAt = null
            await this.repository.save(job).catch(() => undefined)
            this.logger.warn(`Sandbox job ${job.id} has runtimeRef ${runtimeRef} but no persisted Runtime Provider.`)
            return false
        }
        let provider = resolution?.provider
        try {
            provider ??= this.providers.get(providerType)
            await provider.destroy({
                tenantId: job.tenantId,
                workFor: { type: 'job', id: job.id as string },
                runtimeProfile: job.runtimeProfile,
                runtimeBindingId: job.runtimeBindingId ?? 'legacy',
                artifact: {
                    kind: job.runtimeArtifactKind ?? 'oci-image',
                    reference: job.runtimeArtifactReference ?? '',
                    ...(job.runtimeArtifactDigest ? { digest: job.runtimeArtifactDigest } : {})
                },
                runtimeRef: runtimeRef ?? null
            })
            job.cleanupPending = false
            job.cleanedAt = new Date()
            await this.repository.save(job)
            return true
        } catch (error) {
            job.cleanupPending = true
            job.cleanedAt = null
            await this.repository.save(job).catch(() => undefined)
            this.logger.warn(`Failed to destroy sandbox job ${job.id}: ${messageOf(error)}`)
            return false
        }
    }

    private async cleanupVolume(job: SandboxJobEntity): Promise<void> {
        if (!job.id || !job.tenantId) return
        const volume = this.volumeClient.resolve({ tenantId: job.tenantId, catalog: 'runtime-jobs', jobId: job.id })
        await volume
            .deleteFile('')
            .catch((error) => this.logger.warn(`Failed to cleanup sandbox job volume ${job.id}: ${messageOf(error)}`))
    }

    private async cleanupOrphans(): Promise<void> {
        const expired = await this.repository.find({
            where: {
                status: In(['waiting', 'starting', 'running']),
                hardDeadlineAt: LessThan(new Date())
            }
        })
        for (const job of expired) {
            job.status = 'lost'
            job.errorCode = 'SANDBOX_START_FAILED'
            job.errorMessage = 'Sandbox job exceeded its hard deadline and was reclaimed.'
            job.finishedAt = new Date()
            await this.repository.save(job)
            const cleaned = await this.destroySandbox(job)
            if (cleaned) await this.cleanupVolume(job)
        }
        const pendingCleanup = await this.repository.find({ where: { cleanupPending: true } })
        for (const job of pendingCleanup) {
            if (job.status === 'waiting' || job.status === 'starting' || job.status === 'running') continue
            const cleaned = await this.destroySandbox(job)
            if (cleaned) await this.cleanupVolume(job)
        }
    }

    private toSucceeded(job: SandboxJobEntity): SandboxJobRunResult {
        return { ...this.toSnapshot(job), status: 'succeeded' }
    }

    private toSnapshot(job: SandboxJobEntity): SandboxJobSnapshot {
        return {
            id: job.id as string,
            runtimeProfile: job.runtimeProfile,
            sandboxRuntimeVersion: job.sandboxRuntimeVersion,
            action: job.action,
            actionVersion: job.actionVersion,
            status: job.status,
            attempt: job.attempt,
            provider: job.provider,
            runtimeBindingId: job.runtimeBindingId,
            runtimeRef: job.runtimeRef ?? job.containerRef,
            artifactDigest: job.runtimeArtifactDigest,
            containerRef: job.containerRef ?? job.runtimeRef,
            outputs: job.outputs ?? [],
            errorCode: job.errorCode,
            errorMessage: job.errorMessage,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt
        }
    }
}

function validateInputFiles(files: readonly SandboxJobFileInput[], tenantId: string): void {
    const targetPaths = new Set<string>()
    for (const file of files) {
        const targetPath = validateInputFile(file, tenantId)
        if (targetPaths.has(targetPath)) throw new Error(`Sandbox input targetPath is duplicated: ${targetPath}`)
        targetPaths.add(targetPath)
    }
}

function validateInputFile(file: SandboxJobFileInput, tenantId: string): string {
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

function hasReadOnlySeekableInputs(input: SandboxJobRunInput): boolean {
    return input.files?.some((file) => file.access === 'read-only-seekable') ?? false
}

function validateOutputRequest(output: SandboxJobOutputRequest, tenantId: string): void {
    validateRelativePath(output.path, 'output path')
    requiredText(output.originalName, 'output originalName')
    requiredText(output.mimeType, 'output mimeType')
    requiredText(output.destination.folder, 'output destination.folder')
    if (output.destination.tenantId !== tenantId)
        throw new Error('Sandbox output destination belongs to another tenant.')
}

function validateRelativePath(value: string, field: string): string {
    const normalized = value.replace(/\\/g, '/')
    if (!normalized || normalized.includes('\0') || path.posix.isAbsolute(normalized))
        throw new Error(`Sandbox ${field} is invalid.`)
    const clean = path.posix.normalize(normalized)
    if (clean === '.' || clean === '..' || clean.startsWith('../')) throw new Error(`Sandbox ${field} is invalid.`)
    return clean
}

function workspacePath(workspaceRoot: string, area: 'input' | 'output', relativePath: string): string {
    const safe = validateRelativePath(relativePath, `${area} path`)
    return workspaceRoot.startsWith('/')
        ? path.posix.join(workspaceRoot, area, safe)
        : path.join(workspaceRoot, area, safe)
}

function runtimePath(workspaceRoot: string, area: 'action' | '', relativePath: string): string {
    const safe = validateRelativePath(relativePath, 'runtime path')
    const parts = area ? ['runtime', area, safe] : ['runtime', safe]
    return workspaceRoot.startsWith('/') ? path.posix.join(workspaceRoot, ...parts) : path.join(workspaceRoot, ...parts)
}

/** Builds the only argv Core permits a Provider instance to execute for an Action. */
function buildRunnerCommand(definition: SandboxRuntimeDefinition, workspaceRoot: string): string[] {
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
function actionCompatibilityError(
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
async function validateOutput(buffer: Buffer, mimeType: string): Promise<void> {
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

function portableReference(
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

function classifyRunnerFailure(output: string, jobId: string): SandboxJobRuntimeError {
    const normalized = output.toUpperCase()
    if (normalized.includes('SANDBOX_ACTION_INVALID')) {
        return new SandboxJobRuntimeError('SANDBOX_ACTION_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('BROWSER_LAUNCH_FAILED') || normalized.includes('CHROMIUM')) {
        return new SandboxJobRuntimeError('BROWSER_LAUNCH_FAILED', truncateSandboxRunnerOutput(output), true, jobId)
    }
    if (normalized.includes('ENOMEM') || normalized.includes('OUT OF MEMORY') || normalized.includes('OOM')) {
        return new SandboxJobRuntimeError('EXPORT_OOM', truncateSandboxRunnerOutput(output), true, jobId)
    }
    if (normalized.includes('EXPORT_OUTPUT_INVALID')) {
        return new SandboxJobRuntimeError('EXPORT_OUTPUT_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    if (normalized.includes('EXPORT_INPUT_INVALID') || normalized.includes('GOAL SPEC VALIDATION FAILED')) {
        return new SandboxJobRuntimeError('EXPORT_INPUT_INVALID', truncateSandboxRunnerOutput(output), false, jobId)
    }
    return new SandboxJobRuntimeError(
        'SANDBOX_START_FAILED',
        truncateSandboxRunnerOutput(output) || 'Sandbox runner failed.',
        true,
        jobId
    )
}

function normalizeRuntimeError(error: unknown, jobId: string): SandboxJobRuntimeError {
    return error instanceof SandboxJobRuntimeError
        ? error
        : new SandboxJobRuntimeError('SANDBOX_START_FAILED', messageOf(error), true, jobId)
}

function isRetryableCode(code?: SandboxJobErrorCode | null): boolean {
    return (
        code === 'SANDBOX_CAPACITY_UNAVAILABLE' ||
        code === 'SANDBOX_START_FAILED' ||
        code === 'BROWSER_LAUNCH_FAILED' ||
        code === 'EXPORT_TIMEOUT' ||
        code === 'EXPORT_OOM'
    )
}

function normalizeTimeout(value: number | undefined, fallback: number): number {
    return Number.isFinite(value) && Number(value) > 0 ? Math.trunc(Number(value)) : fallback
}

function requiredText(value: string, field: string): string {
    const normalized = value?.trim()
    if (!normalized) throw new Error(`Sandbox job ${field} is required.`)
    return normalized
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function truncateSandboxRunnerOutput(value: string): string {
    const normalized = value.trim()
    const limit = 4_000
    if (normalized.length <= limit) return normalized

    const marker = '\n...[middle of runner output omitted]...\n'
    const available = limit - marker.length
    const headLength = Math.floor(available * 0.45)
    return `${normalized.slice(0, headLength)}${marker}${normalized.slice(-(available - headLength))}`
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function capacityPollInterval(): number {
    return Math.max(250, positiveInteger(process.env.SANDBOX_JOB_CAPACITY_POLL_MS, 1_000))
}

function artifactDigest(reference: string, configured?: string): string | undefined {
    if (configured) return configured.toLowerCase()
    return reference.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase()
}

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}
