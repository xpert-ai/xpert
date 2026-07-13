import {
    DEFAULT_BROWSER_RUNTIME_PROFILE,
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
})
