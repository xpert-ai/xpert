import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FileWorkspaceProjectionService } from './file-workspace-projection.service'

describe('FileWorkspaceProjectionService', () => {
    let tempRoot: string

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'file-workspace-projection-'))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
    })

    it('writes attached files into the conversation workspace and records workspacePath', async () => {
        const asset = {
            id: 'file-asset-1',
            tenantId: 'tenant-1',
            userId: 'user-1',
            storageFileId: 'storage-file-1',
            originalName: '简历.pdf',
            capabilities: ['preview', 'read']
        }
        const fileAssetRepository = {
            findOne: jest.fn().mockResolvedValue(asset),
            save: jest.fn(async (value) => value)
        }
        const storageFileService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'storage-file-1',
                file: 'contexts/tenant-1/file.pdf',
                originalName: '简历.pdf'
            })
        }
        const workAreaResolver = {
            resolve: jest.fn().mockResolvedValue({
                workspaceRoot: '/workspace',
                sessionPath: {
                    relativePath: 'sessions/conversation-1'
                },
                volume: {
                    path: (relativePath: string) => path.join(tempRoot, relativePath)
                }
            })
        }
        const service = new FileWorkspaceProjectionService(
            fileAssetRepository as any,
            storageFileService as any,
            workAreaResolver as any
        )

        const projected = await service.projectFileAsset({
            fileAssetId: 'file-asset-1',
            conversationId: 'conversation-1',
            xpertId: 'xpert-1',
            sandboxProvider: 'docker-sandbox',
            buffer: Buffer.from('pdf bytes')
        })

        expect(projected?.workspacePath).toBe('/workspace/sessions/conversation-1/files/file-asset-1/简历.pdf')
        expect(projected?.capabilities).toContain('workspace')
        await expect(
            fsPromises.readFile(path.join(tempRoot, 'sessions/conversation-1/files/file-asset-1/简历.pdf'), 'utf-8')
        ).resolves.toBe('pdf bytes')
        expect(fileAssetRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'conversation-1',
                xpertId: 'xpert-1',
                workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/简历.pdf'
            })
        )
    })
})
