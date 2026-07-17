import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
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
        workspaceFiles: object = {}
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
            getCachedBundle: jest.fn().mockResolvedValue([])
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
