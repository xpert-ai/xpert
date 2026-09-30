import type { SandboxWorkspaceMapperRegistry } from '@xpert-ai/plugin-sdk'
import { WorkspacePathMapperFactory } from './workspace-path-mapper.factory'

describe('WorkspacePathMapperFactory', () => {
    it('uses the scoped registration without creating a runtime', () => {
        const mapper = { mapVolumeToWorkspace: jest.fn(), mapWorkspaceToVolume: jest.fn() }
        const registry = { listRegistrations: jest.fn(() => [{ type: 'test', strategy: mapper }]) }
        const factory = new WorkspacePathMapperFactory(registry as unknown as SandboxWorkspaceMapperRegistry)
        expect(factory.forProvider('test')).toBe(mapper)
    })

    it('classifies missing workspace mapping as a non-retryable configuration error', () => {
        const factory = new WorkspacePathMapperFactory({
            listRegistrations: () => []
        } as unknown as SandboxWorkspaceMapperRegistry)
        try {
            factory.forProvider('missing')
            throw new Error('Expected a configuration error')
        } catch (error) {
            expect(error).toMatchObject({ status: 400, response: { code: 'provider_unavailable' } })
        }
    })
})
