const mockEnvironment = {
    envName: 'dev',
    env: {
        IS_DOCKER: ''
    },
    sandboxConfig: {
        volume: ''
    }
}

jest.mock('@xpert-ai/server-config', () => ({
    environment: mockEnvironment
}))

import {
    getApiContainerSandboxVolumeRootPath,
    getSandboxVolumeRootPath,
    getDockerHostSandboxVolumeRootPath,
    normalizeSandboxPublicVolumeSubpath,
    normalizeSandboxVolumeRequestSubpath,
    usesFlattenedSandboxVolumeLayout
} from './volume-layout'

describe('volume layout helpers', () => {
    const originalHome = process.env.HOME
    const originalSandboxVolume = process.env.SANDBOX_VOLUME
    const originalSandboxVolumeLayout = process.env.SANDBOX_VOLUME_LAYOUT
    const originalUserProfile = process.env.USERPROFILE

    beforeEach(() => {
        mockEnvironment.envName = 'dev'
        mockEnvironment.env.IS_DOCKER = ''
        mockEnvironment.sandboxConfig = {
            volume: ''
        }
        process.env.HOME = '/Users/tester'
        delete process.env.SANDBOX_VOLUME
        delete process.env.SANDBOX_VOLUME_LAYOUT
        process.env.USERPROFILE = '/Users/tester'
    })

    afterAll(() => {
        process.env.HOME = originalHome
        if (originalSandboxVolume === undefined) {
            delete process.env.SANDBOX_VOLUME
        } else {
            process.env.SANDBOX_VOLUME = originalSandboxVolume
        }
        if (originalSandboxVolumeLayout === undefined) {
            delete process.env.SANDBOX_VOLUME_LAYOUT
        } else {
            process.env.SANDBOX_VOLUME_LAYOUT = originalSandboxVolumeLayout
        }
        process.env.USERPROFILE = originalUserProfile
    })

    it('uses the tenant-layered local data layout in development when sandbox volume is not configured', () => {
        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data/tenant-1')
        expect(normalizeSandboxPublicVolumeSubpath('project/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'project/123e4567-e89b-12d3-a456-426614174000/file.txt'
        )
        expect(
            normalizeSandboxPublicVolumeSubpath(
                'xpert/123e4567-e89b-12d3-a456-426614174000/user/123e4567-e89b-12d3-a456-426614174001/file.txt'
            )
        ).toBe('xpert/123e4567-e89b-12d3-a456-426614174000/user/123e4567-e89b-12d3-a456-426614174001/file.txt')
        expect(normalizeSandboxPublicVolumeSubpath('xpert/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'xpert/123e4567-e89b-12d3-a456-426614174000/file.txt'
        )
    })

    it('falls back to the tenant-layered local data layout when sandboxConfig is missing', () => {
        delete mockEnvironment.sandboxConfig

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data/tenant-1')
    })

    it('uses the legacy flattened local layout only when explicitly opted in', () => {
        process.env.SANDBOX_VOLUME_LAYOUT = 'legacy-flat'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(true)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data')
        expect(normalizeSandboxPublicVolumeSubpath('project/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'file.txt'
        )
    })

    it('keeps tenant and logical subpath when sandbox volume is configured in development', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/tmp/sandbox/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/tmp/sandbox/tenant-1')
        expect(normalizeSandboxPublicVolumeSubpath('project/123e4567-e89b-12d3-a456-426614174000/file.txt')).toBe(
            'project/123e4567-e89b-12d3-a456-426614174000/file.txt'
        )
    })

    it('keeps tenant and logical subpath when SANDBOX_VOLUME is configured', () => {
        process.env.SANDBOX_VOLUME = '/Users/tester/data'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/Users/tester/data/tenant-1')
        expect(normalizeSandboxPublicVolumeSubpath('xpert/xpert-1/shared/file.txt')).toBe(
            'xpert/xpert-1/shared/file.txt'
        )
    })

    it('resolves relative sandbox volume config from the current process root', () => {
        mockEnvironment.sandboxConfig.volume = 'tmp/sandbox'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe(`${process.cwd()}/tmp/sandbox/tenant-1`)
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe(`${process.cwd()}/tmp/sandbox/tenant-1`)
    })

    it('uses the mounted sandbox path for dockerized development stacks', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'
        mockEnvironment.env.IS_DOCKER = 'true'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/sandbox/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/tmp/sandbox/tenant-1')
    })

    it('keeps the API-container root when dockerized development has no configured host volume', () => {
        mockEnvironment.env.IS_DOCKER = 'true'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/sandbox/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/sandbox/tenant-1')
    })

    it('uses the mounted sandbox path outside development', () => {
        mockEnvironment.envName = 'prod'
        mockEnvironment.sandboxConfig.volume = '/mnt/sandbox'

        expect(usesFlattenedSandboxVolumeLayout()).toBe(false)
        expect(getApiContainerSandboxVolumeRootPath('tenant-1')).toBe('/sandbox/tenant-1')
        expect(getDockerHostSandboxVolumeRootPath('tenant-1')).toBe('/mnt/sandbox/tenant-1')
    })

    it.each([
        'foo/../user/user-1/xpert/xpert-1/report.txt',
        'foo\\..\\user\\user-1\\xpert\\xpert-1\\report.txt',
        '/user/user-1/xpert/xpert-1/report.txt',
        '../tenant-2/report.txt',
        'report.txt\0.pdf'
    ])('rejects unsafe public volume request path %s', (subpath) => {
        expect(normalizeSandboxVolumeRequestSubpath(subpath)).toBeNull()
    })

    it('normalizes a safe public volume request path without changing its catalog boundary', () => {
        expect(normalizeSandboxVolumeRequestSubpath('project/project-1/./reports/report.pdf')).toBe(
            'project/project-1/reports/report.pdf'
        )
    })
})
