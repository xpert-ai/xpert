import path from 'node:path'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const mockEnvironment = {
    env: {
        IS_DOCKER: 'true',
        SANDBOX_VOLUME_LAYOUT: undefined as string | undefined
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
    DevVolumeClient,
    LocalShellWorkspacePathMapper,
    VolumeHandle,
    getVolumePublicBaseUrl
} from './volume'

describe('Volume runtime clients', () => {
    beforeEach(() => {
        mockEnvironment.env.IS_DOCKER = 'true'
        mockEnvironment.env.SANDBOX_VOLUME_LAYOUT = undefined
        mockEnvironment.envName = 'prod'
        mockEnvironment.sandboxConfig.volume = '/mnt/sandbox'
    })

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
        expect(
            getVolumePublicBaseUrl({ catalog: 'xperts', xpertId: 'xpert-1', userId: 'user-1', isolateByUser: true })
        ).toBe('http://localhost:3000/api/sandbox/volume/xpert/xpert-1/user/user-1')
    })

    it('resolves user-owned xpert volumes under the exact user and xpert leaf', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'user-xperts',
            xpertId: 'xpert-1',
            userId: 'user-1'
        })

        expect(volume.serverRoot).toBe('/sandbox/tenant-1/user/user-1/xpert/xpert-1')
        expect(volume.hostRoot).toBe('/mnt/sandbox/tenant-1/user/user-1/xpert/xpert-1')
        expect(getVolumePublicBaseUrl({ catalog: 'user-xperts', xpertId: 'xpert-1', userId: 'user-1' })).toBe(
            'http://localhost:3000/api/sandbox/volume/user/user-1/xpert/xpert-1'
        )
    })

    it('omits direct URLs when listing protected Project volumes', async () => {
        const volumeRoot = await mkdtemp(path.join(tmpdir(), 'volume-project-list-'))
        await mkdir(path.join(volumeRoot, 'shared'))
        await writeFile(path.join(volumeRoot, 'shared', 'report.txt'), 'report')
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1' },
            volumeRoot,
            volumeRoot,
            'http://localhost:3000/api/sandbox/volume/project/project-1'
        )

        try {
            const files = await volume.list({ path: 'shared', deepth: 1 })
            expect(files[0]).toMatchObject({ fullPath: 'shared/report.txt' })
            expect(files[0].url).toBeUndefined()
            expect(files[0].fileUrl).toBeUndefined()
        } finally {
            await rm(volumeRoot, { recursive: true, force: true })
        }
    })

    it('keeps local-shell workspace paths on the server-visible volume', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1',
            userId: 'user-1'
        })
        const binding = new LocalShellWorkspacePathMapper().mapVolumeToWorkspace(volume)

        expect(binding.volumeRoot).toBe('/sandbox/tenant-1/project/project-1')
        expect(binding.bindSource).toBeUndefined()
        expect(binding.workspaceRoot).toBe('/sandbox/tenant-1/project/project-1')
        expect(binding.workspacePath).toBe('/sandbox/tenant-1/project/project-1')
    })

    it('isolates short-lived runtime job volumes by tenant and job id', () => {
        const volume = new DockerVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'runtime-jobs',
            jobId: 'job-1'
        })
        expect(volume.serverRoot).toBe('/sandbox/tenant-1/runtime-jobs/job-1')
        expect(volume.hostRoot).toBe('/mnt/sandbox/tenant-1/runtime-jobs/job-1')
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

    it('keeps projects and shared xperts in distinct logical subtrees in local development', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.sandboxConfig.volume = ''

        const projectOne = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1'
        })
        const projectTwo = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-2'
        })
        const xpertOne = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
        const xpertTwo = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-2',
            isolateByUser: false
        })

        const localTenantRoot = path.join(process.env.HOME!, 'data', 'tenant-1')
        expect(projectOne.serverRoot).toBe(path.join(localTenantRoot, 'project', 'project-1'))
        expect(projectTwo.serverRoot).toBe(path.join(localTenantRoot, 'project', 'project-2'))
        expect(xpertOne.serverRoot).toBe(path.join(localTenantRoot, 'xpert', 'xpert-1'))
        expect(xpertTwo.serverRoot).toBe(path.join(localTenantRoot, 'xpert', 'xpert-2'))
        expect(
            new Set([projectOne.serverRoot, projectTwo.serverRoot, xpertOne.serverRoot, xpertTwo.serverRoot]).size
        ).toBe(4)
    })

    it('keeps the previous flat project and shared xpert roots behind the explicit legacy opt-in', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.env.SANDBOX_VOLUME_LAYOUT = 'legacy-flat'
        mockEnvironment.sandboxConfig.volume = ''

        const project = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'projects',
            projectId: 'project-1'
        })
        const xpert = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })

        const legacyRoot = path.join(process.env.HOME!, 'data')
        expect(project.serverRoot).toBe(legacyRoot)
        expect(xpert.serverRoot).toBe(legacyRoot)
    })

    it('keeps runtime jobs isolated even in the opted-in legacy flattened local development layout', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.env.SANDBOX_VOLUME_LAYOUT = 'legacy-flat'
        mockEnvironment.sandboxConfig.volume = ''

        const volume = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'runtime-jobs',
            jobId: 'job-1'
        })

        const expected = path.join(process.env.HOME!, 'data', 'runtime-jobs', 'job-1')
        expect(volume.serverRoot).toBe(expected)
        expect(volume.hostRoot).toBe(expected)
    })

    it('keeps user-owned xpert roots and private URLs isolated in the opted-in legacy flattened layout', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.env.SANDBOX_VOLUME_LAYOUT = 'legacy-flat'
        mockEnvironment.sandboxConfig.volume = ''
        const userId = '123e4567-e89b-12d3-a456-426614174000'
        const xpertId = '123e4567-e89b-12d3-a456-426614174001'

        const volume = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'user-xperts',
            userId,
            xpertId
        })

        const expected = path.join(process.env.HOME!, 'data', 'user', userId, 'xpert', xpertId)
        expect(volume.serverRoot).toBe(expected)
        expect(volume.hostRoot).toBe(expected)
        expect(volume.publicBaseUrl).toBe(`http://localhost:3000/api/sandbox/volume/user/${userId}/xpert/${xpertId}`)
    })

    it('keeps legacy user-isolated xpert roots private in the opted-in legacy flattened layout', () => {
        mockEnvironment.env.IS_DOCKER = 'false'
        mockEnvironment.envName = 'dev'
        mockEnvironment.env.SANDBOX_VOLUME_LAYOUT = 'legacy-flat'
        mockEnvironment.sandboxConfig.volume = ''
        const userId = '123e4567-e89b-12d3-a456-426614174000'
        const xpertId = '123e4567-e89b-12d3-a456-426614174001'

        const volume = new DevVolumeClient().resolve({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            userId,
            xpertId,
            isolateByUser: true
        })

        const expected = path.join(process.env.HOME!, 'data', 'xpert', xpertId, 'user', userId)
        expect(volume.serverRoot).toBe(expected)
        expect(volume.hostRoot).toBe(expected)
        expect(volume.publicBaseUrl).toBe(`http://localhost:3000/api/sandbox/volume/xpert/${xpertId}/user/${userId}`)
    })
})
