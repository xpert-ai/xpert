import { SandboxJobControlStore } from './sandbox-job-control.store'
import { SandboxJobControlService } from './sandbox-job-control.service'
import { readControlledSandboxJob } from './sandbox-job-control-record'
import { SandboxJobInvocationSession } from './sandbox-job-invocation'
import {
    createVerifiedReadOnlyInputSnapshot,
    ensureExactRuntimeJobDirectory,
    validateInputFiles,
    hasReadOnlySeekableInputs,
    validateOutputRequest,
    validateRelativePath,
    workspacePath,
    runtimePath,
    buildRunnerCommand,
    actionCompatibilityError,
    validateOutput,
    portableReference,
    classifyRunnerFailure,
    normalizeRuntimeError,
    isRetryableCode,
    normalizeTimeout,
    requiredText,
    messageOf,
    wait,
    capacityPollInterval,
    artifactDigest
} from './sandbox-job-files'
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { t } from 'i18next'
import path from 'node:path'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    SandboxJobsRuntimeCapability,
    SandboxJobRuntimeError,
    SandboxRuntimeProviderRegistry,
    type SandboxJobErrorCode,
    type SandboxJobFileInput,
    type SandboxJobOutput,
    type SandboxJobOutputRequest,
    type SandboxJobProgress,
    type SandboxJobActionHealth,
    type SandboxJobRunInput,
    type SandboxJobRunOptions,
    type SandboxJobRunResult,
    type SandboxJobsApi,
    type SandboxJobSnapshot,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeDefinition,
    type SandboxRuntimeInstance,
    type SandboxRuntimeReadOnlyFile,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { WorkspaceFilesRuntimeCapabilityService } from '../../shared/runtime/workspace-files-runtime-capability.service'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { SandboxJobCapacityService } from './sandbox-job-capacity.service'
import { SandboxJobEntity } from './sandbox-job.entity'
import {
    lifecycleSandboxJobProgress,
    SandboxJobProgressDecoder,
    timestampSandboxJobProgress
} from './sandbox-job-progress'
import { RegisteredSandboxAction, SandboxActionRegistry } from './sandbox-action.registry'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'
import {
    SandboxRuntimeBindingSelector,
    type SandboxRuntimeResolution
} from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeHealthService } from './sandbox-runtime-health.service'

export { truncateSandboxRunnerOutput, classifyRunnerFailure } from './sandbox-job-files'

const MAX_JOB_INPUT_BYTES = 350 * 1024 * 1024
const MAX_JOB_OUTPUT_BYTES = 350 * 1024 * 1024
const RUNTIME_JOB_WORKSPACE_DIRECTORY = 'workspace'

// The business body may stop waiting before the runtime or callback exits.
// The control service alone confirms settlement and releases capacity.
@Injectable()
@RuntimeCapabilityProvider(SandboxJobsRuntimeCapability)
export class SandboxJobRuntimeCapabilityService implements SandboxJobsApi {
    private readonly logger = new Logger(SandboxJobRuntimeCapabilityService.name)

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
        private readonly volumeClient: VolumeClient,
        private readonly control: SandboxJobControlService,
        private readonly controlStore: SandboxJobControlStore
    ) {}

    /** Reserve once; duplicate calls only wait for the original generation. */
    async run(input: SandboxJobRunInput, options?: SandboxJobRunOptions): Promise<SandboxJobRunResult> {
        options?.signal?.throwIfAborted()
        const { action, definition } = await this.requireRunnableAction(input)
        const existing = await this.findIdempotent(input.scope.tenantId, input.idempotencyKey)
        if (existing) {
            this.controlStore.assertInput(existing, input)
            return this.waitForAttachedJob(existing.id, definition.hardDeadlineMs, options?.signal)
        }
        const resolution = await this.bindingSelector.require(definition, input.jobId, {
            readOnlyFileMounts: hasReadOnlySeekableInputs(input),
            executionControl: true
        })
        const seed = this.prepareAttempt(input, action, definition, resolution)
        const { job, owner } = await this.controlStore.reserve(
            seed,
            input,
            resolution.provider.version,
            options?.controlPolicy ?? 'attached'
        )
        if (owner) {
            const controller = new AbortController()
            this.control.own(job, () => controller.abort())
            // The promise owns real work independently of HTTP/tool wait cancellation.
            void this.control
                .inContext(job, async () => {
                    try {
                        await this.waitForCapacity(job, controller.signal)
                        await this.execute(job, input, action, definition, resolution, {
                            ...options,
                            signal: controller.signal
                        })
                    } catch (error) {
                        await this.control.report(job, controller.signal.aborted ? 'cancelled' : 'failed', {
                            errorCode: controller.signal.aborted ? 'SANDBOX_CANCELLED' : 'SANDBOX_START_FAILED',
                            errorMessage: messageOf(error)
                        })
                    } finally {
                        await this.control.hostExited(job)
                    }
                })
                .catch(() => this.logger.warn('Sandbox host settlement remains pending'))
        }
        const stop = () => {
            void this.control.requestStop(job).catch(() => this.logger.warn('Sandbox cancellation persistence failed'))
        }
        if ((options?.controlPolicy ?? 'attached') === 'attached')
            options?.signal?.addEventListener('abort', stop, { once: true })
        try {
            if (options?.signal?.aborted && (options?.controlPolicy ?? 'attached') === 'attached')
                await this.control.requestStop(job)
            return await this.waitForAttachedJob(job.id, definition.hardDeadlineMs, options?.signal)
        } finally {
            options?.signal?.removeEventListener('abort', stop)
        }
    }

    /** Accept durable intent; a terminal snapshot requires actual exit evidence. */
    async cancel(input: { jobId: string }): Promise<SandboxJobSnapshot> {
        const job = await this.findTenantScopedJob(input.jobId)
        if (!job)
            throw new SandboxJobRuntimeError(
                'SANDBOX_CANCELLED',
                t('server-ai:Error.SandboxJobCancelled'),
                false,
                input.jobId
            )
        await this.control.requestStop(job)
        return this.toSnapshot(await this.controlStore.read(job.id))
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
        const job = await this.repository.findOne({ where: { id: jobId, tenantId } })
        return job ? readControlledSandboxJob(job) : null
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

    private prepareAttempt(
        input: SandboxJobRunInput,
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition,
        resolution: SandboxRuntimeResolution
    ): SandboxJobEntity {
        const job = this.repository.create()
        if (input.jobId) job.id = input.jobId
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
        job.progress = lifecycleSandboxJobProgress(null, 'waiting')
        job.attempt = 1
        job.runtimeRef = null
        job.containerRef = null
        job.cleanupPending = false
        job.cleanedAt = null
        job.outputs = []
        job.errorCode = null
        job.errorMessage = null
        job.startedAt = null
        job.finishedAt = null
        job.hardDeadlineAt = new Date(Date.now() + definition.hardDeadlineMs)
        return job
    }

    private async waitForCapacity(job: SandboxJobEntity, signal: AbortSignal): Promise<void> {
        for (;;) {
            signal.throwIfAborted()
            if ((await this.control.desired(job)) === 'terminated') throw new Error('Sandbox execution terminated')
            if (Date.now() >= job.hardDeadlineAt.getTime()) throw new Error('Sandbox capacity wait exceeded deadline')
            try {
                return await this.capacity.acquire(job)
            } catch (error) {
                if (!(error instanceof SandboxJobRuntimeError) || error.code !== 'SANDBOX_CAPACITY_UNAVAILABLE')
                    throw error
                await wait(capacityPollInterval())
            }
        }
    }

    private async execute(
        job: SandboxJobEntity,
        input: SandboxJobRunInput,
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition,
        resolution: SandboxRuntimeResolution,
        options?: SandboxJobRunOptions
    ): Promise<SandboxJobRunResult> {
        const jobId = job.id as string
        let runtime: SandboxRuntimeInstance | undefined
        let invocations: SandboxJobInvocationSession | undefined
        let invocationDeadline: ReturnType<typeof setTimeout> | undefined
        let invocationTimedOut = false
        const abort = () => {
            invocations?.close()
            void Promise.resolve()
                .then(() => runtime?.terminate?.())
                .catch(() => undefined)
        }
        options?.signal?.addEventListener('abort', abort, { once: true })
        try {
            options?.signal?.throwIfAborted()
            await this.controlStore.update(jobId, job.generation, (current) => {
                current.cleanupPending = true
            })
            const volume = await this.volumeClient
                .resolve({ tenantId: input.scope.tenantId, catalog: 'runtime-jobs', jobId })
                .ensureRoot()
            await ensureExactRuntimeJobDirectory(volume, RUNTIME_JOB_WORKSPACE_DIRECTORY)
            const readOnlyFiles = await this.prepareReadOnlyInputs(input, volume)
            job = await this.control.prepare(job, resolution)
            const createOptions: SandboxRuntimeCreateOptions = {
                ephemeral: true,
                controlTarget: job.control.target,
                tenantId: input.scope.tenantId,
                workFor: { type: 'job', id: jobId },
                definition,
                binding: resolution.binding,
                volume: {
                    serverRoot: volume.path(RUNTIME_JOB_WORKSPACE_DIRECTORY),
                    hostRoot: path.join(volume.hostRoot, RUNTIME_JOB_WORKSPACE_DIRECTORY)
                },
                resources: definition.resources,
                networkPolicy: definition.networkPolicy,
                security: definition.security,
                hardDeadlineMs: definition.hardDeadlineMs,
                ...(readOnlyFiles.length ? { readOnlyFiles } : {})
            }
            runtime = await resolution.provider.create(createOptions)
            job = await this.controlStore.update(jobId, job.generation, (current) => {
                current.runtimeRef = runtime.id
                current.control.phase = 'running'
                if (current.status !== 'cancelling') current.status = 'running'
            })
            options?.signal?.throwIfAborted()

            const materializedAction = await this.materializeAction(runtime, runtime.workspaceRoot, action, definition)
            await this.materializeInputs(runtime, runtime.workspaceRoot, input, materializedAction, definition)
            const timeoutMs = Math.min(
                normalizeTimeout(input.timeoutMs, definition.timeoutMs),
                definition.hardDeadlineMs
            )
            const progressDecoder = new SandboxJobProgressDecoder()
            let progressWrites = Promise.resolve()
            const scheduleProgress = (progress: SandboxJobProgress) => {
                const persisted = timestampSandboxJobProgress(progress)
                progressWrites = progressWrites
                    .then(async () => {
                        job.progress = persisted
                        await this.repository.update(
                            { id: jobId, generation: job.generation, status: 'running' },
                            { progress: persisted }
                        )
                    })
                    .catch((error) => {
                        this.logger.warn(`Failed to persist sandbox job progress ${jobId}: ${messageOf(error)}`)
                    })
            }
            options?.signal?.throwIfAborted()
            if ((await this.control.desired(job)) === 'terminated')
                throw new SandboxJobRuntimeError(
                    'SANDBOX_CANCELLED',
                    t('server-ai:Error.SandboxJobCancelled'),
                    false,
                    jobId
                )
            if (options?.invocation) {
                invocations = new SandboxJobInvocationSession(jobId, runtime, options, (id, work) =>
                    this.control.callback(job, id, work)
                )
                invocationDeadline = setTimeout(() => {
                    invocationTimedOut = true
                    invocations?.close()
                    abort()
                }, timeoutMs)
                invocationDeadline.unref()
            }
            const response = await runtime.execute(buildRunnerCommand(definition, runtime.workspaceRoot), {
                timeoutMs,
                maxOutputBytes: 4 * 1024 * 1024,
                onOutput: (output) => {
                    progressDecoder.push(output).forEach(scheduleProgress)
                    invocations?.push(output)
                }
            })
            progressDecoder.flush().forEach(scheduleProgress)
            await progressWrites
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
            await invocations?.finish()
            if (invocationDeadline) clearTimeout(invocationDeadline)
            options?.signal?.throwIfAborted()
            await this.assertReadOnlyInputsUnchanged(readOnlyFiles, jobId)
            const outputs = await this.collectOutputs(runtime, runtime.workspaceRoot, input.outputs)
            options?.signal?.throwIfAborted()
            await this.control.report(job, 'succeeded', { outputs })
            return this.toSucceeded({ ...job, outputs })
        } catch (error) {
            const runtimeError = options?.signal?.aborted
                ? new SandboxJobRuntimeError(
                      'SANDBOX_CANCELLED',
                      t('server-ai:Error.SandboxJobCancelled'),
                      false,
                      jobId
                  )
                : invocationTimedOut
                  ? new SandboxJobRuntimeError(
                        'EXPORT_TIMEOUT',
                        t('server-ai:Error.SandboxInvocationTimeout'),
                        true,
                        jobId
                    )
                  : invocations?.error
                    ? new SandboxJobRuntimeError(
                          'SANDBOX_INVOCATION_FAILED',
                          t('server-ai:Error.SandboxInvocationFailed'),
                          false,
                          jobId
                      )
                    : normalizeRuntimeError(error, jobId)
            await this.control.report(job, runtimeError.code === 'SANDBOX_CANCELLED' ? 'cancelled' : 'failed', {
                errorCode: runtimeError.code,
                errorMessage: runtimeError.message
            })
            throw runtimeError
        } finally {
            if (invocationDeadline) clearTimeout(invocationDeadline)
            invocations?.close()
            options?.signal?.removeEventListener('abort', abort)
            // Closing the protocol wait does not close the actual callback or its file writes.
            await invocations?.drain()
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
            await ensureExactRuntimeJobDirectory(
                volume,
                path.posix.dirname(path.posix.join(RUNTIME_JOB_WORKSPACE_DIRECTORY, targetPath))
            )
            const snapshot = await createVerifiedReadOnlyInputSnapshot(volume, source, file, files.length).catch(
                (error) => {
                    throw new SandboxJobRuntimeError(
                        'EXPORT_INPUT_INVALID',
                        `Unable to snapshot seekable input ${file.targetPath}: ${messageOf(error)}`,
                        false
                    )
                }
            )
            files.push({ source: snapshot, targetPath, size: file.size, sha256: file.sha256 })
        }
        return files
    }

    /** Reject successful output when the platform-owned input snapshot changed in place. */
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
        action: RegisteredSandboxAction,
        definition: SandboxRuntimeDefinition
    ): Promise<RegisteredSandboxAction> {
        const uploads: Array<[string, Uint8Array]> = []
        let materializedAction = action
        let bundle: Awaited<ReturnType<SandboxActionRegistry['getCachedBundle']>>
        try {
            bundle = await this.actions.getCachedBundle(materializedAction)
        } catch (initialError) {
            // A local plugin refresh replaces its immutable runtime directory. The
            // registry evicts the stale absolute paths after the failed read, so
            // resolve the trusted Action identity once more and finish this Job
            // against the replacement bundle instead of failing the first export.
            this.logger.warn(
                `Sandbox Action ${action.pluginName}:${action.name}@${action.version} changed during materialization; resolving the current bundle and retrying once: ${messageOf(initialError)}`
            )
            try {
                const refreshedAction = await this.actions.get({
                    pluginName: action.pluginName,
                    action: action.name,
                    actionVersion: action.version
                })
                if (!refreshedAction) throw initialError
                const compatibility = actionCompatibilityError(refreshedAction, definition)
                if (compatibility) throw new Error(compatibility)
                materializedAction = refreshedAction
                bundle = await this.actions.getCachedBundle(materializedAction)
            } catch (retryError) {
                throw new SandboxJobRuntimeError('SANDBOX_ACTION_INVALID', messageOf(retryError), false)
            }
        }
        for (const file of bundle) {
            uploads.push([runtimePath(workspaceRoot, 'action', file.relativePath), file.content])
        }
        const actionManifest = Buffer.from(
            JSON.stringify({
                name: materializedAction.name,
                version: materializedAction.version,
                runtimeContractVersion: materializedAction.runtimeContractVersion,
                ...(materializedAction.playwrightVersion
                    ? { playwrightVersion: materializedAction.playwrightVersion }
                    : {}),
                entrypoint: materializedAction.entrypoint,
                bundleSha256: materializedAction.bundleSha256
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
        return materializedAction
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

    private async waitForAttachedJob(
        jobId: string,
        timeoutMs: number,
        signal?: AbortSignal
    ): Promise<SandboxJobRunResult> {
        const deadline = Date.now() + timeoutMs
        while (Date.now() < deadline) {
            if (signal?.aborted)
                throw new SandboxJobRuntimeError(
                    'SANDBOX_CANCELLED',
                    t('server-ai:Error.SandboxJobCancelled'),
                    false,
                    jobId
                )
            const current = await this.repository.findOne({ where: { id: jobId } })
            if (!current)
                throw new SandboxJobRuntimeError(
                    'SANDBOX_START_FAILED',
                    'Attached sandbox job disappeared.',
                    true,
                    jobId
                )
            if (current.status === 'succeeded') return this.toSucceeded(current)
            if (!current.control)
                throw new SandboxJobRuntimeError(
                    'SANDBOX_CONTROL_UNCONFIRMED',
                    t('server-ai:Error.SandboxControlUnconfirmed'),
                    false,
                    jobId
                )
            if (
                current.status === 'failed' ||
                current.status === 'cancelled' ||
                current.status === 'lost' ||
                current.status === 'unknown'
            ) {
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
            progress: job.progress,
            attempt: job.attempt,
            generation: job.generation ?? undefined,
            controlState: job.control?.phase === 'settled' ? 'settled' : job.control ? 'pending' : 'unknown',
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
