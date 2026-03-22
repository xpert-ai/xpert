const mockEnvironment = {
    envName: 'dev',
    sandboxConfig: {
        volume: ''
    }
}

jest.mock('@metad/server-config', () => ({
    environment: mockEnvironment
}))

import {
    getSandboxVolumeRootPath,
    normalizeSandboxPublicVolumeSubpath,
    usesFlattenedSandboxVolumeLayout
} from './volume-layout'

describe('volume layout helpers', () => {
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

    it('uses the flattened local data layout in development when sandbox volume is not configured', () => {
        expect(usesFlattenedSandboxVolumeLayout()).toBe(true)
        expect(getSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data')
        expect(normalizeSandboxPublicVolumeSubpath('project/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'file.txt'
        )
    })

    it('keeps tenant and logical subpath when sandbox volume is configured in development', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getSandboxVolumeRootPath('tenant-1')).toBe('/tmp/sandbox/tenant-1')
        expect(normalizeSandboxPublicVolumeSubpath('project/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'project/123e4567-e89b-12d3-a456-426614174000/file.txt'
        )
    })

    it('uses the mounted sandbox path outside development', () => {
        mockEnvironment.envName = 'prod'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getSandboxVolumeRootPath('tenant-1')).toBe('/sandbox/tenant-1')
    })
})
