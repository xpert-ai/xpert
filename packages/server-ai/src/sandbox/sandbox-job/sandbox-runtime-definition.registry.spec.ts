import {
    AI_BROWSER_RUNTIME_PROFILE,
    DEFAULT_BROWSER_RUNTIME_PROFILE,
    VIDEO_BROWSER_RUNTIME_PROFILE,
    SandboxRuntimeDefinitionRegistry
} from './sandbox-runtime-definition.registry'

describe('SandboxRuntimeDefinitionRegistry', () => {
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
})
