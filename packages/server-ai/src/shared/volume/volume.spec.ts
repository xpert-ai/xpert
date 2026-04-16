const mockEnvironment = {
    env: {
        IS_DOCKER: 'true'
    },
    envName: 'prod',
    baseUrl: 'http://localhost:3000'
}

jest.mock('@xpert-ai/server-config', () => ({
    environment: mockEnvironment
}))

import fsPromises from 'fs/promises'
import { VolumeClient } from './volume'

describe('VolumeClient shared workspace helpers', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns the shared project workspace root for project runs', async () => {
        const mkdirSpy = jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)

        await expect(VolumeClient.getSharedWorkspacePath('tenant-1', 'project-1', 'user-1')).resolves.toBe(
            '/sandbox/tenant-1/project/project-1'
        )
        expect(VolumeClient.getSharedWorkspaceUrl('project-1', 'user-1')).toBe(
            'http://localhost:3000/api/sandbox/volume/project/project-1'
        )
        expect(mkdirSpy).toHaveBeenCalledWith('/sandbox/tenant-1/project/project-1', { recursive: true })
    })

    it('returns the shared user workspace root for non-project runs', async () => {
        const mkdirSpy = jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)

        await expect(VolumeClient.getSharedWorkspacePath('tenant-1', undefined, 'user-1')).resolves.toBe(
            '/sandbox/tenant-1/user/user-1'
        )
        expect(VolumeClient.getSharedWorkspaceUrl(undefined, 'user-1')).toBe(
            'http://localhost:3000/api/sandbox/volume/user/user-1'
        )
        expect(mkdirSpy).toHaveBeenCalledWith('/sandbox/tenant-1/user/user-1', { recursive: true })
    })

    it('returns the project workspace as the default conversation directory for project conversations', async () => {
        const mkdirSpy = jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)

        await expect(
            VolumeClient.getConversationDefaultWorkspacePath('tenant-1', 'project-1', 'user-1', 'thread-1')
        ).resolves.toBe('/sandbox/tenant-1/project/project-1')
        expect(VolumeClient.getConversationDefaultWorkspaceKey('project-1', 'thread-1')).toBe('')
        expect(VolumeClient.getConversationDefaultWorkspaceUrl('project-1', 'user-1', 'thread-1')).toBe(
            'http://localhost:3000/api/sandbox/volume/project/project-1'
        )
        expect(mkdirSpy).toHaveBeenCalledWith('/sandbox/tenant-1/project/project-1', { recursive: true })
    })

    it('returns the thread directory as the default conversation directory for non-project conversations', async () => {
        const mkdirSpy = jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)

        await expect(
            VolumeClient.getConversationDefaultWorkspacePath('tenant-1', undefined, 'user-1', 'thread-1')
        ).resolves.toBe('/sandbox/tenant-1/user/user-1/thread-1')
        expect(VolumeClient.getConversationDefaultWorkspaceKey(undefined, 'thread-1')).toBe('thread-1')
        expect(VolumeClient.getConversationDefaultWorkspaceUrl(undefined, 'user-1', 'thread-1')).toBe(
            'http://localhost:3000/api/sandbox/volume/user/user-1/thread-1/'
        )
        expect(mkdirSpy).toHaveBeenCalledWith('/sandbox/tenant-1/user/user-1/thread-1', { recursive: true })
    })
})
