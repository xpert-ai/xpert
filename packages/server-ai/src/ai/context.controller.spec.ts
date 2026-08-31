jest.mock('./public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn(),
    getPublicXpertSessionConversationScope: jest.fn()
}))

import { getPublicXpertSessionConversationScope } from './public-xpert-principal'
import { CreateFileAssetCommand } from '../file-understanding'
import { ForbiddenException } from '@nestjs/common'
import { ContextsController } from './context.controller'

describe('ContextsController restricted uploads', () => {
    it('ignores a client-supplied workspacePath for restricted assistant sessions', async () => {
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue({
            createdById: 'employee-1',
            xpertId: 'xpert-1'
        })
        const storageFile = {
            id: 'storage-1',
            file: 'contexts/files/file.txt',
            originalName: 'file.txt',
            size: 4,
            mimetype: 'text/plain'
        }
        const commandBus = {
            execute: jest
                .fn()
                .mockResolvedValueOnce({
                    status: 'success',
                    destinations: [
                        {
                            kind: 'storage',
                            status: 'success',
                            metadata: { storageFile }
                        }
                    ]
                })
                .mockResolvedValueOnce({
                    id: 'asset-1',
                    status: 'ready'
                })
        }
        const controller = new ContextsController(
            { execute: jest.fn() } as never,
            commandBus as never,
            {} as never,
            {
                assertConversationAccess: jest.fn(),
                assertCanCreateConversationAsset: jest.fn(),
                assertUploadScope: jest.fn()
            } as never
        )
        const file = {
            originalname: 'file.txt',
            mimetype: 'text/plain',
            size: 4,
            buffer: Buffer.from('test')
        } as Express.Multer.File

        await controller.create(
            file,
            undefined,
            'chat_attachment',
            'none',
            undefined,
            undefined,
            undefined,
            'xpert-1',
            '../../forged/path.txt'
        )

        const createCommand = commandBus.execute.mock.calls[1][0] as CreateFileAssetCommand
        expect(createCommand.input.workspacePath).toBeUndefined()
    })

    it('rejects a read-only Project member before UploadFileCommand persists bytes', async () => {
        ;(getPublicXpertSessionConversationScope as jest.Mock).mockReturnValue(null)
        const commandBus = { execute: jest.fn() }
        const conversation = {
            id: 'conversation-1',
            threadId: 'thread-1',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        }
        const fileAssetAccessService = {
            assertConversationAccess: jest.fn().mockResolvedValue(conversation),
            assertCanCreateConversationAsset: jest
                .fn()
                .mockRejectedValue(new ForbiddenException('Project editor access is required')),
            assertUploadScope: jest.fn()
        }
        const controller = new ContextsController(
            { execute: jest.fn() } as never,
            commandBus as never,
            {} as never,
            fileAssetAccessService as never
        )

        await expect(
            controller.create(
                {
                    originalname: 'report.docx',
                    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size: 4,
                    buffer: Buffer.from('docx')
                } as Express.Multer.File,
                undefined,
                'chat_attachment',
                'none',
                conversation.id,
                conversation.threadId,
                conversation.projectId,
                conversation.xpertId
            )
        ).rejects.toThrow('Project editor access is required')

        expect(fileAssetAccessService.assertCanCreateConversationAsset).toHaveBeenCalledWith(conversation, 'upload')
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
