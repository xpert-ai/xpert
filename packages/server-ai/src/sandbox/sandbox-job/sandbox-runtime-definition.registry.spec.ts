import {
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
