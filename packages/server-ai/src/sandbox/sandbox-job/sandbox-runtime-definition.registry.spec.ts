import {
    AI_BROWSER_RUNTIME_PROFILE,
    COMPUTE_RUNTIME_PROFILE,
    DEFAULT_BROWSER_RUNTIME_PROFILE,
    DOCUMENT_LIBREOFFICE_RUNTIME_PROFILE,
    VIDEO_BROWSER_RUNTIME_PROFILE,
    SandboxRuntimeDefinitionRegistry
} from './sandbox-runtime-definition.registry'
import computeDefinition from './runtime-definitions/compute-node-python-v1.json'

describe('SandboxRuntimeDefinitionRegistry', () => {
    it('loads an offline compute profile with enforced input immutability and bounded resources', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require(COMPUTE_RUNTIME_PROFILE)
        expect(definition.networkPolicy).toEqual({ mode: 'none' })
        expect(definition.security).toMatchObject({
            runAsNonRoot: true,
            readOnlyRootFilesystem: true,
            readOnlyWorkspace: true,
            noNewPrivileges: true,
            dropCapabilities: 'all'
        })
        expect(definition.requirements).toMatchObject({
            isolation: 'hardened',
            resourceLimits: true,
            networkPolicy: true,
            readOnlyWorkspace: true
        })
        expect(definition.timeoutMs).toBeLessThanOrEqual(definition.hardDeadlineMs)
        expect(definition.resources).toMatchObject({ cpu: 1, memoryMb: 256, tempDiskMb: 64 })
        expect(definition).not.toHaveProperty('provider')
        expect(definition).not.toHaveProperty('image')
    })

    it.each(['true', 1, null])(
        'rejects invalid readOnlyWorkspace values (%s) instead of weakening security',
        (value) => {
            for (const field of ['security', 'requirements'] as const) {
                const original = { ...computeDefinition[field] }
                try {
                    Object.assign(computeDefinition[field], { readOnlyWorkspace: value })
                    expect(() => new SandboxRuntimeDefinitionRegistry()).toThrow('readOnlyWorkspace must be a boolean')
                } finally {
                    Object.assign(computeDefinition[field], original)
                }
            }
        }
    )

    it.each(['security', 'requirements'] as const)(
        'rejects a read-only policy that disagrees with its provider requirements (%s)',
        (field) => {
            const original = { ...computeDefinition[field] }
            try {
                Object.assign(computeDefinition[field], { readOnlyWorkspace: false })
                expect(() => new SandboxRuntimeDefinitionRegistry()).toThrow(
                    'must match requirements.readOnlyWorkspace'
                )
            } finally {
                Object.assign(computeDefinition[field], original)
            }
        }
    )

    it.each(['document/node-20/v1', 'document/java-17/v1'])(
        'declares %s with locked offline dependencies',
        (profile) => {
            const definition = new SandboxRuntimeDefinitionRegistry().require(profile)
            expect(definition.expectedManifest.dependenciesSha256).toMatch(/^[a-f0-9]{64}$/)
            expect(definition.networkPolicy.mode).toBe('none')
            expect(definition.security.runAsNonRoot).toBe(true)
            expect(definition.security.readOnlyRootFilesystem).toBe(true)
            expect(definition.requirements.isolation).toBe('hardened')
        }
    )
    it('declares a pinned offline Python document profile', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require('document/python-3.12/v1')
        expect(definition.expectedManifest.pythonVersion).toBe('3.12.10')
        expect(definition.expectedManifest.markitdownVersion).toBe('0.1.7')
        expect(definition.expectedManifest.requirementsSha256).toMatch(/^[a-f0-9]{64}$/)
        expect(definition.networkPolicy.mode).toBe('none')
        expect(definition.security.readOnlyRootFilesystem).toBe(true)
    })
    it('loads the provider-neutral Browser Runtime Definition from the OSS Core catalog', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require(DEFAULT_BROWSER_RUNTIME_PROFILE)
        expect(definition.command).toEqual(['node', '/opt/xpert/sandbox-runtime/runner-host.mjs'])
        expect(definition.expectedManifest.playwrightVersion).toBe('1.61.0')
        expect(definition.requirements.isolation).toBe('hardened')
        expect(definition).not.toHaveProperty('provider')
        expect(definition).not.toHaveProperty('image')
    })

    it('loads the generic Browser AI Runtime Definition with immutable model catalog evidence', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require(AI_BROWSER_RUNTIME_PROFILE)
        expect(definition.expectedManifest.imageFamily).toBe('browser-ai')
        expect(definition.expectedManifest.onnxRuntimeVersion).toBe('1.26.0-dev.20260416-b7804b056c')
        expect(definition.expectedManifest.modelCatalogSha256).toMatch(/^[a-f0-9]{64}$/)
        expect(definition.hardDeadlineMs).toBe(900_000)
        expect(definition.networkPolicy.mode).toBe('none')
    })

    it('loads the generic Node 22 Browser Video Runtime Definition', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require(VIDEO_BROWSER_RUNTIME_PROFILE)
        expect(definition.expectedManifest.nodeVersion).toBe('22.17.1')
        expect(definition.expectedManifest.ffmpegVersion).toBe('6.1')
        expect(definition.resources.tempDiskMb).toBe(16384)
        expect(definition.networkPolicy.mode).toBe('none')
        expect(definition).not.toHaveProperty('provider')
        expect(definition).not.toHaveProperty('image')
    })

    it('loads the network-isolated LibreOffice document Runtime Definition', () => {
        const definition = new SandboxRuntimeDefinitionRegistry().require(DOCUMENT_LIBREOFFICE_RUNTIME_PROFILE)
        expect(definition.expectedManifest.imageFamily).toBe('document')
        expect(definition.expectedManifest.libreOfficeMajorVersion).toBe('7')
        expect(definition.resources.memoryMb).toBe(4096)
        expect(definition.networkPolicy.mode).toBe('none')
        expect(definition.security.readOnlyRootFilesystem).toBe(true)
        expect(definition).not.toHaveProperty('provider')
        expect(definition).not.toHaveProperty('image')
    })
})
