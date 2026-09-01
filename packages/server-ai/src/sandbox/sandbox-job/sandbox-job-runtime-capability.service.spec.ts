import {
    RequestContext,
    type SandboxJobRunInput,
    type SandboxRuntimeCreateOptions,
    type SandboxRuntimeInstance
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { VolumeHandle } from '../../shared/volume'
import {
    classifyRunnerFailure,
    SandboxJobRuntimeCapabilityService,
    truncateSandboxRunnerOutput
} from './sandbox-job-runtime-capability.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

const PROFILE = 'browser/playwright-1.61/v1'
const ACTION = 'document.export'
const ACTION_VERSION = '9.1.0'
const SANDBOX_RUNTIME_VERSION = new SandboxRuntimeDefinitionRegistry().require(PROFILE).sandboxRuntimeVersion

describe('sandbox runner output formatting', () => {
    it('preserves the beginning and root-cause tail of long runner output', () => {
        const result = truncateSandboxRunnerOutput(`START:${'worker-log\n'.repeat(600)}ROOT_CAUSE_END`)

        expect(result.length).toBeLessThanOrEqual(4_000)
        expect(result).toContain('START:')
        expect(result).toContain('runner output omitted')
        expect(result).toContain('ROOT_CAUSE_END')
    })

    it('classifies deterministic media decode and seek failures as non-retryable', () => {
        expect(
            classifyRunnerFailure('EXPORT_MEDIA_FAILED: CUT_MEDIA_SEEK_FAILED in Chromium decoder', 'job-1')
        ).toMatchObject({
            code: 'EXPORT_MEDIA_FAILED',
            retryable: false,
            jobId: 'job-1'
        })
    })

    it('removes provider-neutral progress events from persisted runner errors', () => {
        const result = truncateSandboxRunnerOutput(
            [
                'XPERT_SANDBOX_PROGRESS {"progress":0.1,"stage":"rendering"}',
                'XPERT_SANDBOX_PROGRESS {"progress":0.2,"stage":"rendering"}',
                'EXPORT_MEDIA_FAILED: CUT_MEDIA_SEEK_FAILED {"targetTime":60.15}'
            ].join('\n')
        )

        expect(result).toBe('EXPORT_MEDIA_FAILED: CUT_MEDIA_SEEK_FAILED {"targetTime":60.15}')
    })
})

describe('SandboxJobRuntimeCapabilityService action validation', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
    })
    afterEach(() => {
        jest.restoreAllMocks()
    })

    function createService(
        actionOverrides: object = {},
        repository: object = {},
        healthOverrides: object = {},
        providerRegistry: object = { get: jest.fn() },
        volumeClient: object = {},
        workspaceFiles: object = {},
        actionRegistryOverrides: object = {}
    ) {
        const actions = {
            get: jest.fn().mockResolvedValue({
                pluginName: '@acme/plugin-document-export',
                name: ACTION,
                version: ACTION_VERSION,
                runtimeProfile: PROFILE,
                runtimeContractVersion: '1',
                playwrightVersion: '1.61.0',
                bundleSha256: 'c'.repeat(64),
                bundleRoot: '/plugin/action',
                entrypoint: 'runner.mjs',
                files: [],
                ...actionOverrides
            }),
            getCachedBundle: jest.fn().mockResolvedValue([]),
            ...actionRegistryOverrides
        }
        return new SandboxJobRuntimeCapabilityService(
            repository as never,
            new SandboxRuntimeDefinitionRegistry(),
            actions as never,
            providerRegistry as never,
            { require: jest.fn() } as never,
            {
                getProfileHealth: jest.fn().mockResolvedValue({
                    available: true,
                    provider: 'fake-runtime',
                    runtimeBindingId: 'fake-browser',
                    artifactDigest: `sha256:${'b'.repeat(64)}`,
                    manifest: { profileName: PROFILE },
                    ...healthOverrides
                })
            } as never,
            workspaceFiles as never,
            {} as never,
            volumeClient as never
        )
    }

    it('rejects path traversal before creating a job or container', async () => {
        await expect(
            createService().run({
                action: ACTION,
                actionVersion: ACTION_VERSION,
                idempotencyKey: 'document-export:export-1:checksum',
                scope: scope(),
                payload: {},
                files: [
                    {
                        reference: {
                            source: 'platform.workspace.files',
                            tenantId: 'tenant-1',
                            userId: 'user-1',
                            catalog: 'users',
                            filePath: 'assets/image.png',
                            workspacePath: '/workspace/assets/image.png'
                        },
                        targetPath: '../escape.png',
                        size: 1,
                        sha256: 'a'.repeat(64)
                    }
                ],
                outputs: outputs()
            })
        ).rejects.toMatchObject({ code: 'EXPORT_INPUT_INVALID', retryable: false })
    })

    it('rejects an unknown input access mode before selecting a Runtime', async () => {
        await expect(
            createService().run({
                action: ACTION,
                actionVersion: ACTION_VERSION,
                idempotencyKey: 'document-export:export-1:invalid-access',
                scope: scope(),
                payload: {},
                files: [{ ...inputFile('assets/image.png'), access: 'stream-from-url' as never }],
                outputs: outputs()
            })
        ).rejects.toMatchObject({ code: 'EXPORT_INPUT_INVALID', retryable: false })
    })

    it('rejects duplicate normalized input aliases before selecting a Runtime', async () => {
        await expect(
            createService().run({
                action: ACTION,
                actionVersion: ACTION_VERSION,
                idempotencyKey: 'document-export:export-1:duplicate-input',
                scope: scope(),
                payload: {},
                files: [inputFile('assets/image.png'), inputFile('assets/./image.png')],
                outputs: outputs()
            })
        ).rejects.toMatchObject({ code: 'EXPORT_INPUT_INVALID', retryable: false })
    })

    it('does not read or upload seekable Workspace media during input materialization', async () => {
        const readBuffer = jest.fn()
        const uploadFiles = jest.fn().mockResolvedValue([{ path: '/workspace/input/job.json', error: null }])
        const service = createService({}, {}, {}, { get: jest.fn() }, {}, { readBuffer })
        const definition = new SandboxRuntimeDefinitionRegistry().require(PROFILE)

        await (
            service as unknown as {
                materializeInputs: (...args: unknown[]) => Promise<void>
            }
        ).materializeInputs(
            { uploadFiles },
            '/workspace',
            {
                scope: scope(),
                payload: {},
                files: [{ ...inputFile('media/source.mov'), access: 'read-only-seekable' }],
                outputs: outputs()
            },
            { name: ACTION, version: ACTION_VERSION },
            definition
        )

        expect(readBuffer).not.toHaveBeenCalled()
        expect(uploadFiles).toHaveBeenCalledWith([['/workspace/input/job.json', expect.any(Buffer)]])
    })

    it('executes against a stable seekable-input snapshot outside the mounted Job workspace', async () => {
        const harness = await createExecuteHarness()
        try {
            harness.runtime.execute.mockImplementation(async () => {
                const readOnlyFile = harness.createOptions?.readOnlyFiles?.[0]
                if (!readOnlyFile) throw new Error('Provider did not receive a read-only input snapshot')
                const snapshotStat = await stat(readOnlyFile.source.serverPath)
                expect(snapshotStat.mode & 0o222).toBe(0)
                expect(snapshotStat.nlink).toBe(1)
                await writeFile(harness.sourcePath, Buffer.from('mutated after Provider creation'))
                await expect(readFile(readOnlyFile.source.serverPath)).resolves.toEqual(harness.sourceBuffer)
                return successfulExecution()
            })

            await expect(harness.execute()).resolves.toMatchObject({ status: 'succeeded' })

            const options = harness.createOptions
            expect(options?.volume).toEqual({
                serverRoot: path.join(harness.jobRoot, 'workspace'),
                hostRoot: path.join(harness.hostRoot, 'workspace')
            })
            const snapshot = options?.readOnlyFiles?.[0].source
            if (!snapshot) throw new Error('Provider did not receive a read-only input snapshot')
            expect(snapshot.serverPath).not.toBe(harness.sourcePath)
            expect(snapshot.serverPath).toEqual(expect.stringContaining(path.join('.platform', 'inputs')))
            expect(path.relative(path.join(harness.jobRoot, 'workspace'), snapshot.serverPath)).toMatch(/^\.\./)
            expect(harness.provider.destroy).toHaveBeenCalledTimes(1)
            await expect(access(harness.jobRoot)).rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await harness.dispose()
        }
    })

    it('rejects a seekable input whose copied bytes do not match the declared digest and cleans the Job volume', async () => {
        const harness = await createExecuteHarness({ declaredSha256: '0'.repeat(64) })
        try {
            await expect(harness.execute()).rejects.toMatchObject({
                code: 'EXPORT_INPUT_INVALID',
                retryable: false
            })

            expect(harness.provider.create).not.toHaveBeenCalled()
            expect(harness.provider.destroy).toHaveBeenCalledTimes(1)
            await expect(access(harness.jobRoot)).rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await harness.dispose()
        }
    })

    it('cleans the isolated snapshot and workspace when Runtime execution fails', async () => {
        const harness = await createExecuteHarness()
        try {
            harness.runtime.execute.mockResolvedValue({
                output: 'EXPORT_MEDIA_FAILED: deterministic decoder failure',
                exitCode: 1,
                timedOut: false,
                truncated: false
            })

            await expect(harness.execute()).rejects.toMatchObject({
                code: 'EXPORT_MEDIA_FAILED',
                retryable: false
            })

            expect(harness.provider.create).toHaveBeenCalledTimes(1)
            expect(harness.provider.destroy).toHaveBeenCalledTimes(1)
            await expect(access(harness.jobRoot)).rejects.toMatchObject({ code: 'ENOENT' })
        } finally {
            await harness.dispose()
        }
    })

    it('re-resolves a refreshed local Action before failing the current Job', async () => {
        const staleAction = {
            pluginName: '@acme/plugin-document-export',
            name: ACTION,
            version: ACTION_VERSION,
            runtimeProfile: PROFILE,
            runtimeContractVersion: '1',
            playwrightVersion: '1.61.0',
            bundleSha256: 'c'.repeat(64),
            bundleRoot: '/plugins/stale/action',
            entrypoint: 'runner.mjs',
            files: []
        }
        const refreshedAction = {
            ...staleAction,
            bundleSha256: 'd'.repeat(64),
            bundleRoot: '/plugins/current/action'
        }
        const missing = Object.assign(new Error('no such file or directory'), { code: 'ENOENT' })
        const get = jest.fn().mockResolvedValue(refreshedAction)
        const getCachedBundle = jest
            .fn()
            .mockRejectedValueOnce(missing)
            .mockResolvedValueOnce([{ relativePath: 'runner.mjs', content: Buffer.from('ok') }])
        const uploadFiles = jest.fn().mockResolvedValue([])
        const service = createService({}, {}, {}, { get: jest.fn() }, {}, {}, { get, getCachedBundle })
        const definition = new SandboxRuntimeDefinitionRegistry().require(PROFILE)

        const result = await (
            service as unknown as {
                materializeAction: (...args: unknown[]) => Promise<typeof refreshedAction>
            }
        ).materializeAction({ uploadFiles }, '/workspace', staleAction, definition)

        expect(result).toBe(refreshedAction)
        expect(get).toHaveBeenCalledWith({
            pluginName: staleAction.pluginName,
            action: ACTION,
            actionVersion: ACTION_VERSION
        })
        expect(getCachedBundle).toHaveBeenNthCalledWith(1, staleAction)
        expect(getCachedBundle).toHaveBeenNthCalledWith(2, refreshedAction)
        const uploads = uploadFiles.mock.calls[0][0] as Array<[string, Buffer]>
        expect(JSON.parse(uploads[0][1].toString('utf8'))).toMatchObject({
            bundleSha256: refreshedAction.bundleSha256,
            entrypoint: refreshedAction.entrypoint
        })
        expect(uploads[1]).toEqual(['/workspace/runtime/action/runner.mjs', Buffer.from('ok')])
    })

    it('rejects Action and Runtime contract mismatch as non-retryable', async () => {
        await expect(
            createService({ runtimeContractVersion: '2' }).run({
                action: ACTION,
                actionVersion: ACTION_VERSION,
                idempotencyKey: 'document-export:export-1:checksum',
                scope: scope(),
                payload: {},
                outputs: outputs()
            })
        ).rejects.toMatchObject({ code: 'SANDBOX_VERSION_MISMATCH', retryable: false })
    })

    it('rejects a run request for a different tenant', async () => {
        await expect(
            createService().run({
                action: ACTION,
                actionVersion: ACTION_VERSION,
                idempotencyKey: 'document-export:export-1:checksum',
                scope: { ...scope(), tenantId: 'tenant-2' },
                payload: {},
                outputs: outputs()
            })
        ).rejects.toMatchObject({ code: 'EXPORT_INPUT_INVALID', retryable: false })
    })

    it('reports action health and probes the generic Runtime Profile', async () => {
        const service = createService()
        await expect(
            service.getActionHealth({
                pluginName: '@acme/plugin-document-export',
                action: ACTION,
                actionVersion: ACTION_VERSION
            })
        ).resolves.toMatchObject({
            available: true,
            runtimeProfile: PROFILE,
            sandboxRuntimeVersion: SANDBOX_RUNTIME_VERSION
        })
    })

    it('scopes public job lookup to the active tenant', async () => {
        const findOne = jest.fn().mockResolvedValue(null)
        const service = createService({}, { findOne })

        await expect(service.getJob({ jobId: 'job-1' })).resolves.toBeNull()
        expect(findOne).toHaveBeenCalledWith({ where: { id: 'job-1', tenantId: 'tenant-1' } })
    })

    it('fails closed when public job lookup has no tenant context', async () => {
        const findOne = jest.fn()
        jest.mocked(RequestContext.currentTenantId).mockReturnValue(null)
        const service = createService({}, { findOne })

        await expect(service.getJob({ jobId: 'job-1' })).resolves.toBeNull()
        expect(findOne).not.toHaveBeenCalled()
    })

    it('keeps cleanup pending when the persisted Runtime Provider is temporarily unavailable', async () => {
        const job = sandboxJob({ runtimeRef: 'runtime-1', provider: 'removed-provider' })
        const save = jest.fn().mockImplementation(async (value) => value)
        const service = createService({}, { findOne: jest.fn().mockResolvedValue(job), save })

        await expect(service.cancel({ jobId: 'job-1' })).resolves.toMatchObject({ status: 'cancelled' })
        expect(job.cleanupPending).toBe(true)
        expect(job.cleanedAt).toBeNull()
    })

    it('asks the persisted Provider to sweep Job labels even when runtimeRef was never saved', async () => {
        const job = sandboxJob({ runtimeRef: null, provider: 'fake-runtime' })
        const save = jest.fn().mockImplementation(async (value) => value)
        const destroy = jest.fn().mockResolvedValue(undefined)
        const deleteFile = jest.fn().mockResolvedValue(undefined)
        const service = createService(
            {},
            { findOne: jest.fn().mockResolvedValue(job), save },
            {},
            { get: jest.fn().mockReturnValue({ destroy }) },
            { resolve: jest.fn().mockReturnValue({ deleteFile }) }
        )

        await service.cancel({ jobId: 'job-1' })

        expect(destroy).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                workFor: { type: 'job', id: 'job-1' },
                runtimeRef: null
            })
        )
        expect(job.cleanupPending).toBe(false)
        expect(job.cleanedAt).toBeInstanceOf(Date)
        expect(deleteFile).toHaveBeenCalledWith('')
    })
})

function scope() {
    return {
        tenantId: 'tenant-1',
        pluginName: '@acme/plugin-document-export',
        businessResourceType: 'document-export',
        businessResourceId: 'export-1'
    }
}
function outputs() {
    return [
        {
            path: 'document.pdf',
            originalName: 'document.pdf',
            mimeType: 'application/pdf',
            destination: { tenantId: 'tenant-1', userId: 'user-1', catalog: 'users' as const, folder: 'exports' }
        }
    ]
}

function inputFile(targetPath: string) {
    return {
        reference: {
            source: 'platform.workspace.files' as const,
            tenantId: 'tenant-1',
            userId: 'user-1',
            catalog: 'users' as const,
            filePath: 'assets/image.png',
            workspacePath: '/workspace/assets/image.png'
        },
        targetPath,
        size: 1,
        sha256: 'a'.repeat(64)
    }
}

function sandboxJob(overrides: object) {
    return {
        id: 'job-1',
        tenantId: 'tenant-1',
        runtimeProfile: PROFILE,
        sandboxRuntimeVersion: '1.0.0',
        action: ACTION,
        actionVersion: ACTION_VERSION,
        status: 'running',
        attempt: 1,
        runtimeBindingId: 'fake-binding',
        runtimeArtifactKind: 'oci-image',
        runtimeArtifactReference: 'fake-image@sha256:' + 'b'.repeat(64),
        runtimeArtifactDigest: 'sha256:' + 'b'.repeat(64),
        cleanupPending: true,
        cleanedAt: null,
        outputs: [],
        createdAt: new Date(),
        ...overrides
    }
}

async function createExecuteHarness(options: { declaredSha256?: string } = {}) {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'xpert-sandbox-job-execute-'))
    const sourcePath = path.join(temporaryRoot, 'source.mov')
    const sourceBuffer = Buffer.from('stable seekable media')
    await writeFile(sourcePath, sourceBuffer)
    const sourceStat = await stat(sourcePath)
    const canonicalSourcePath = await realpath(sourcePath)
    const jobRoot = path.join(temporaryRoot, 'runtime-job')
    const hostRoot = path.join('/host/runtime-jobs', 'job-1')
    const volume = await new VolumeHandle(
        { tenantId: 'tenant-1', catalog: 'runtime-jobs', jobId: 'job-1' },
        jobRoot,
        hostRoot,
        'http://localhost/volume/runtime-jobs/job-1'
    ).ensureRoot()
    const repository = {
        save: jest.fn().mockImplementation(async (value) => value),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined)
    }
    const workspaceFiles = {
        resolveReadOnlyFileSource: jest.fn().mockResolvedValue({
            serverPath: canonicalSourcePath,
            hostPath: sourcePath,
            size: sourceStat.size,
            mtimeMs: sourceStat.mtimeMs,
            device: sourceStat.dev,
            inode: sourceStat.ino
        }),
        uploadBuffer: jest.fn().mockResolvedValue({
            filePath: 'exports/result.txt',
            workspacePath: '/workspace/exports/result.txt',
            catalog: 'users',
            size: 6
        })
    }
    const runtime = {
        id: 'runtime-1',
        workspaceRoot: '/workspace',
        uploadFiles: jest
            .fn()
            .mockImplementation(async (files: Array<[string, Uint8Array]>) =>
                files.map(([filePath]) => ({ path: filePath, error: null }))
            ),
        downloadFiles: jest
            .fn()
            .mockImplementation(async (paths: string[]) =>
                paths.map((filePath) => ({ path: filePath, content: Buffer.from('output'), error: null }))
            ),
        execute: jest.fn().mockResolvedValue(successfulExecution())
    } satisfies SandboxRuntimeInstance & {
        uploadFiles: jest.Mock
        downloadFiles: jest.Mock
        execute: jest.Mock
    }
    let createOptions: SandboxRuntimeCreateOptions | undefined
    const provider = {
        type: 'fake-runtime',
        version: '1.0.0',
        capabilities: {
            isolation: 'hardened',
            ephemeral: true,
            resourceLimits: true,
            networkPolicy: true,
            readOnlyRootFilesystem: true,
            readOnlyFileMounts: true
        },
        listBindings: jest.fn().mockReturnValue([]),
        getBindingHealth: jest.fn(),
        create: jest.fn().mockImplementation(async (value: SandboxRuntimeCreateOptions) => {
            createOptions = value
            return runtime
        }),
        destroy: jest.fn().mockResolvedValue(undefined)
    }
    const service = createServiceForExecute(repository, workspaceFiles, volume, provider)
    const definition = new SandboxRuntimeDefinitionRegistry().require(PROFILE)
    const action = {
        pluginName: '@acme/plugin-document-export',
        name: ACTION,
        version: ACTION_VERSION,
        runtimeProfile: PROFILE,
        runtimeContractVersion: '1',
        playwrightVersion: '1.61.0',
        bundleSha256: 'c'.repeat(64),
        bundleRoot: '/plugin/action',
        entrypoint: 'runner.mjs',
        files: []
    }
    const input: SandboxJobRunInput = {
        action: ACTION,
        actionVersion: ACTION_VERSION,
        idempotencyKey: 'document-export:export-1:snapshot',
        scope: scope(),
        payload: {},
        files: [
            {
                ...inputFile('media/source.mov'),
                access: 'read-only-seekable',
                size: sourceBuffer.length,
                sha256: options.declaredSha256 ?? createHash('sha256').update(sourceBuffer).digest('hex')
            }
        ],
        outputs: [
            {
                path: 'result.txt',
                originalName: 'result.txt',
                mimeType: 'text/plain',
                destination: { tenantId: 'tenant-1', userId: 'user-1', catalog: 'users', folder: 'exports' }
            }
        ]
    }
    const job = sandboxJob({
        status: 'waiting',
        progress: null,
        provider: 'fake-runtime',
        runtimeRef: null,
        cleanupPending: false
    })
    const resolution = {
        provider,
        binding: {
            id: 'fake-binding',
            provider: 'fake-runtime',
            runtimeProfile: PROFILE,
            priority: 0,
            artifact: {
                kind: 'oci-image',
                reference: `fake-image@sha256:${'b'.repeat(64)}`,
                digest: `sha256:${'b'.repeat(64)}`
            }
        }
    }

    return {
        sourcePath: canonicalSourcePath,
        sourceBuffer,
        jobRoot,
        hostRoot,
        runtime,
        provider,
        get createOptions() {
            return createOptions
        },
        execute: () =>
            (
                service as unknown as {
                    execute: (
                        job: object,
                        input: SandboxJobRunInput,
                        action: object,
                        definition: object,
                        resolution: object
                    ) => Promise<unknown>
                }
            ).execute(job, input, action, definition, resolution),
        dispose: () => rm(temporaryRoot, { recursive: true, force: true })
    }
}

function createServiceForExecute(repository: object, workspaceFiles: object, volume: VolumeHandle, provider: object) {
    const actions = {
        get: jest.fn(),
        getCachedBundle: jest.fn().mockResolvedValue([])
    }
    return new SandboxJobRuntimeCapabilityService(
        repository as never,
        new SandboxRuntimeDefinitionRegistry(),
        actions as never,
        { get: jest.fn().mockReturnValue(provider) } as never,
        { require: jest.fn() } as never,
        { getProfileHealth: jest.fn() } as never,
        workspaceFiles as never,
        {} as never,
        { resolve: jest.fn().mockReturnValue(volume) } as never
    )
}

function successfulExecution() {
    return {
        output: '',
        exitCode: 0,
        timedOut: false,
        truncated: false
    }
}
