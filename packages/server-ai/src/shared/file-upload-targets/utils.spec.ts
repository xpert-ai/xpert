const mockEnvironment = {
    envName: 'dev',
    baseUrl: 'http://localhost:3000',
    sandboxConfig: {
        volume: ''
    }
}

jest.mock('@metad/server-config', () => ({
    environment: mockEnvironment
}))

import { resolveVolumeTarget } from './utils'

describe('resolveVolumeTarget', () => {
    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE

    beforeEach(() => {
        mockEnvironment.envName = 'dev'
        mockEnvironment.sandboxConfig.volume = ''
        process.env.HOME = '/Users/tester'
        process.env.USERPROFILE = '/Users/tester'
    })

    afterAll(() => {
        process.env.HOME = originalHome
        process.env.USERPROFILE = originalUserProfile
    })

    it('writes to the flattened local root when sandbox volume is not configured', () => {
        const volume = resolveVolumeTarget(
            {
                catalog: 'projects',
                projectId: '123e4567-e89b-12d3-a456-426614174000'
            } as any,
            { tenantId: 'tenant-1', userId: 'user-1' }
        )

        expect(volume.rootPath).toBe('/Users/tester/data')
        expect(volume.baseUrl).toBe(
            'http://localhost:3000/api/sandbox/volume/project/123e4567-e89b-12d3-a456-426614174000'
        )
    })

    it('keeps the logical project subpath when sandbox volume is configured in development', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        const volume = resolveVolumeTarget(
            {
                catalog: 'projects',
                projectId: '123e4567-e89b-12d3-a456-426614174000'
            } as any,
            { tenantId: 'tenant-1', userId: 'user-1' }
        )

        expect(volume.rootPath).toBe('/tmp/sandbox/tenant-1/project/123e4567-e89b-12d3-a456-426614174000')
    })
})
