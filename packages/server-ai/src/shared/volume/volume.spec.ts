const mockEnvironment = {
    env: {
        IS_DOCKER: 'true'
    },
    envName: 'prod',
    baseUrl: 'http://localhost:3000',
    sandboxConfig: {
        volume: '/mnt/sandbox'
    }
}

jest.mock('@xpert-ai/server-config', () => ({
    environment: mockEnvironment
}))

import {
    DockerVolumeClient,
    DockerWorkspacePathMapper,
    DevVolumeClient,
    getVolumePublicBaseUrl
} from './volume'

describe('Volume runtime clients', () => {
    it('resolves docker project volumes as distinct server and host roots', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })

        expect(volume.serverRoot).toBe('/sandbox/tenant-1/project/project-1')
        expect(volume.hostRoot).toBe('/mnt/sandbox/tenant-1/project/project-1')
        expect(volume.publicBaseUrl).toBe('http://localhost:3000/api/sandbox/volume/project/project-1')
    })

    it('resolves docker xpert volumes with user isolation', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            userId: 'user-1',
            isolateByUser: true
        })

        expect(volume.serverRoot).toBe('/sandbox/tenant-1/xpert/xpert-1/user/user-1')
        expect(volume.hostRoot).toBe('/mnt/sandbox/tenant-1/xpert/xpert-1/user/user-1')
        expect(getVolumePublicBaseUrl({ catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: true })).toBe(
            'http://localhost:3000/api/sandbox/volume/xpert/xpert-1/user/user-1'
        )
    })

    it('maps docker volumes to /workspace inside the sandbox container', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        const binding = new DockerWorkspacePathMapper().mapVolumeToWorkspace(volume)

        expect(binding.volumeRoot).toBe('/sandbox/tenant-1/project/project-1')
        expect(binding.bindSource).toBe('/mnt/sandbox/tenant-1/project/project-1')
        expect(binding.workspaceRoot).toBe('/workspace')
        expect(binding.workspacePath).toBe('/workspace')
    })

    it('keeps serverRoot and hostRoot identical for direct host runtime volumes', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.sandboxConfig.volume = '/tmp/sandbox'

        const volume = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'users',
            userId: 'user-1'
        })

        expect(volume.serverRoot).toBe('/tmp/sandbox/tenant-1/user/user-1')
        expect(volume.hostRoot).toBe('/tmp/sandbox/tenant-1/user/user-1')
    })

    it('returns the explicit current user workspace root helpers', async () => {
        const mkdirSpy = jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)

        await expect(VolumeClient.getCurrentUserWorkspacePath('tenant-1', 'user-1')).resolves.toBe(
            '/sandbox/tenant-1/user/user-1'
        )
        expect(VolumeClient.getCurrentUserWorkspaceUrl('user-1')).toBe(
            'http://localhost:3000/api/sandbox/volume/user/user-1'
        )
        expect(mkdirSpy).toHaveBeenCalledWith('/sandbox/tenant-1/user/user-1', { recursive: true })
    })
})
