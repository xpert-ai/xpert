const mockEnvironment = {
    envName: 'dev',
    baseUrl: 'http://localhost:3000',
    sandboxConfig: {
        volume: ''
    }
}

jest.mock('@xpert-ai/server-config', () => ({
    environment: mockEnvironment
}))

import { normalizeFileName, resolveVolumeTarget } from './utils'
import { IUploadFileVolumeTarget } from '@xpert-ai/contracts'

describe('resolveVolumeTarget', () => {
    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE

    beforeEach(() => {
        mockEnvironment.envName = 'dev'
        mockEnvironment.sandboxConfig = {
            volume: ''
        }
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
                kind: 'volume',
                catalog: 'projects',
                projectId: '123e4567-e89b-12d3-a456-426614174000'
            } satisfies IUploadFileVolumeTarget,
            { tenantId: 'tenant-1', userId: 'user-1' }
        )

        expect(volume.serverRoot).toBe('/Users/tester/data')
        expect(volume.publicBaseUrl).toBe('http://localhost:3000/api/sandbox/volume/project/123e4567-e89b-12d3-a456-426614174000')
    })

    it('keeps the logical project subpath when sandbox volume is configured in development', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        const volume = resolveVolumeTarget(
            {
                kind: 'volume',
                catalog: 'projects',
                projectId: '123e4567-e89b-12d3-a456-426614174000'
            } satisfies IUploadFileVolumeTarget,
            { tenantId: 'tenant-1', userId: 'user-1' }
        )

        expect(volume.serverRoot).toBe('/tmp/sandbox/tenant-1/project/123e4567-e89b-12d3-a456-426614174000')
    })

    it('falls back to the flattened local root when sandboxConfig is missing', () => {
        delete mockEnvironment.sandboxConfig

        const volume = resolveVolumeTarget(
            {
                kind: 'volume',
                catalog: 'projects',
                projectId: '123e4567-e89b-12d3-a456-426614174000'
            } satisfies IUploadFileVolumeTarget,
            { tenantId: 'tenant-1', userId: 'user-1' }
        )

        expect(volume.serverRoot).toBe('/Users/tester/data')
        expect(volume.publicBaseUrl).toBe('http://localhost:3000/api/sandbox/volume/project/123e4567-e89b-12d3-a456-426614174000')
    })

    it('resolves user-isolated xpert volumes under the shared xpert workspace root', () => {
        const volume = resolveVolumeTarget(
            {
                kind: 'volume',
                catalog: 'xperts',
                xpertId: '123e4567-e89b-12d3-a456-426614174001'
            } satisfies IUploadFileVolumeTarget,
            { tenantId: 'tenant-1', userId: '123e4567-e89b-12d3-a456-426614174002' }
        )

        expect(volume.serverRoot).toBe('/Users/tester/data')
        expect(volume.publicBaseUrl).toBe(
            'http://localhost:3000/api/sandbox/volume/user/123e4567-e89b-12d3-a456-426614174002'
        )
    })

    it('resolves shared xpert volumes without user isolation when requested', () => {
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        const volume = resolveVolumeTarget(
            {
                kind: 'volume',
                catalog: 'xperts',
                xpertId: '123e4567-e89b-12d3-a456-426614174001',
                isolateByUser: false
            } satisfies IUploadFileVolumeTarget,
            { tenantId: 'tenant-1', userId: '123e4567-e89b-12d3-a456-426614174002' }
        )

        expect(volume.serverRoot).toBe('/tmp/sandbox/tenant-1/xpert/123e4567-e89b-12d3-a456-426614174001')
        expect(volume.publicBaseUrl).toBe('http://localhost:3000/api/sandbox/volume/xpert/123e4567-e89b-12d3-a456-426614174001')
    })

    it('normalizes multipart mojibake file names to utf8', () => {
        const mojibakeName = Buffer.from('中文文件.md', 'utf8').toString('latin1')

        expect(normalizeFileName(mojibakeName)).toBe('中文文件.md')
    })

    it('keeps already-decoded utf8 file names unchanged', () => {
        expect(normalizeFileName('中文文件.md')).toBe('中文文件.md')
    })
})
