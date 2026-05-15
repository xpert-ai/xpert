jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn()
    }
}))

const mockList = jest.fn()
const mockReadFile = jest.fn()
const mockSaveFile = jest.fn()
const mockWriteMemory = jest.fn()
const mockVolumeSubtreeClient = jest.fn().mockImplementation(() => ({
    list: mockList,
    readFile: mockReadFile,
    saveFile: mockSaveFile
}))

jest.mock('../shared/volume', () => ({
    VolumeSubtreeClient: mockVolumeSubtreeClient
}))

import { TFile } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { VolumeSubtreeClient } from '../shared/volume'
import { FileMemoryFacade } from './file-memory.facade'

describe('FileMemoryFacade memory files', () => {
    let facade: FileMemoryFacade
    const scopeResolver = {
        resolve: jest.fn()
    }
    const volumeHandle = {
        path: jest.fn(),
        publicUrl: jest.fn()
    }
    const volumeClient = {
        resolve: jest.fn(() => volumeHandle)
    }

    beforeEach(() => {
        jest.clearAllMocks()
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        scopeResolver.resolve.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1'
        })

        facade = new FileMemoryFacade(
            scopeResolver as any,
            { writeMemory: mockWriteMemory } as any,
            {} as any,
            volumeClient as any
        )
    })

    it('lists files inside the current xpert memory workspace', async () => {
        mockList.mockResolvedValue([])

        await facade.getMemoryFiles('xpert-1', 'docs', 2)

        expect(scopeResolver.resolve).toHaveBeenCalledWith('xpert-1')
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
        expect(VolumeSubtreeClient).toHaveBeenCalledWith(volumeHandle, { allowRootWorkspace: true })
        expect(mockList).toHaveBeenCalledWith('.xpert/memory/xperts/xpert-1', {
            path: 'docs',
            deepth: 2
        })
    })

    it('reads files inside the current xpert memory workspace', async () => {
        mockReadFile.mockResolvedValue({
            filePath: 'README.md'
        } as TFile)

        await facade.getMemoryFile('xpert-1', 'README.md')

        expect(scopeResolver.resolve).toHaveBeenCalledWith('xpert-1')
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
        expect(mockReadFile).toHaveBeenCalledWith('.xpert/memory/xperts/xpert-1', 'README.md')
    })

    it('saves files inside the current xpert memory workspace', async () => {
        mockSaveFile.mockResolvedValue({
            filePath: 'README.md',
            contents: '# Updated\n'
        } as TFile)

        await facade.saveMemoryFile('xpert-1', 'README.md', '# Updated\n')

        expect(scopeResolver.resolve).toHaveBeenCalledWith('xpert-1')
        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'xperts',
            xpertId: 'xpert-1',
            isolateByUser: false
        })
        expect(mockSaveFile).toHaveBeenCalledWith('.xpert/memory/xperts/xpert-1', 'README.md', '# Updated\n')
    })

    it('delegates built-in file memory writes with the xpert-level entity', async () => {
        mockWriteMemory.mockResolvedValue({ memoryId: 'mem-1' })

        await facade.writeFileMemory('xpert-1', {
            type: 'project',
            title: 'FileMemory v2',
            summary: 'One xpert has one memory root.',
            content: 'No user-specific memory root.'
        })

        expect(mockWriteMemory).toHaveBeenCalledWith(
            {
                id: 'xpert-1',
                tenantId: 'tenant-1'
            },
            expect.objectContaining({
                type: 'project',
                title: 'FileMemory v2'
            })
        )
    })
})
