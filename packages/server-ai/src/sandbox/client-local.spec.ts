const mockMkdir = jest.fn()
const mockWriteFile = jest.fn()
const mockList = jest.fn()
const mockReadFile = jest.fn()
const mockDeleteFile = jest.fn()
const mockGetVolumePath = jest.fn((filePath?: string) => (filePath ? `/volume/${filePath}` : '/volume'))
const mockGetCurrentUserWorkspacePath = jest.fn()

jest.mock('node:fs/promises', () => ({
    mkdir: mockMkdir,
    writeFile: mockWriteFile
}))

jest.mock('../shared', () => ({
    VolumeClient: jest.fn().mockImplementation(() => ({
        list: mockList,
        readFile: mockReadFile,
        deleteFile: mockDeleteFile,
        getVolumePath: mockGetVolumePath
    }))
}))

import path from 'node:path'
import fsPromises from 'node:fs/promises'
import { VolumeClient } from '../shared'
import { FileLocalSystem, GitLocalClient } from './client-local'

describe('FileLocalSystem', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetCurrentUserWorkspacePath.mockResolvedValue('/tmp/user-workspace')
        ;(VolumeClient as unknown as { getCurrentUserWorkspacePath: jest.Mock }).getCurrentUserWorkspacePath =
            mockGetCurrentUserWorkspacePath
    })

    it('stores created files in the current user volume root', async () => {
        const fileSystem = new FileLocalSystem({
            tenantId: 'tenant-1',
            userId: 'user-1',
            projectId: 'project-1'
        } as any)

        await fileSystem.createFile(
            {
                workspace_id: '',
                file_path: 'docs/notes.md',
                file_contents: '# Notes\n',
                file_description: null
            },
            { signal: {} as AbortSignal }
        )

        expect(VolumeClient).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'users',
            userId: 'user-1'
        })
        expect(mockGetVolumePath).toHaveBeenCalledWith(path.join('', 'docs/notes.md'))
        expect(fsPromises.mkdir).toHaveBeenCalledWith('/volume/docs', { recursive: true })
        expect(fsPromises.writeFile).toHaveBeenCalledWith('/volume/docs/notes.md', '# Notes\n')
    })

    it('lists files from the current user volume root', async () => {
        const createdAt = new Date('2026-04-16T00:00:00.000Z')
        mockList.mockResolvedValue([
            {
                filePath: 'README.md',
                fileType: 'md',
                size: 42,
                createdAt
            }
        ])

        const fileSystem = new FileLocalSystem({
            tenantId: 'tenant-1',
            userId: 'user-1',
            projectId: 'project-1'
        } as any)

        const result = await fileSystem.listFiles(
            {
                workspace_id: '',
                path: 'docs',
                depth: 2,
                limit: 1000
            },
            { signal: {} as AbortSignal }
        )

        expect(VolumeClient).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'users',
            userId: 'user-1'
        })
        expect(mockList).toHaveBeenCalledWith({
            path: path.join('', 'docs'),
            deepth: 2
        })
        expect(result).toEqual({
            files: [
                {
                    name: 'README.md',
                    extension: 'md',
                    size: 42,
                    created_date: createdAt.toISOString()
                }
            ]
        })
    })
})

describe('GitLocalClient', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetCurrentUserWorkspacePath.mockResolvedValue('/tmp/user-workspace')
        ;(VolumeClient as unknown as { getCurrentUserWorkspacePath: jest.Mock }).getCurrentUserWorkspacePath =
            mockGetCurrentUserWorkspacePath
    })

    it('resolves git workspace paths from the current user root', async () => {
        const client = new GitLocalClient({
            tenantId: 'tenant-1',
            userId: 'user-1',
            projectId: 'project-1'
        } as any)

        await expect(client.getWorkspacePath()).resolves.toBe('/tmp/user-workspace')
        expect(mockGetCurrentUserWorkspacePath).toHaveBeenCalledWith('tenant-1', 'user-1')
    })
})
