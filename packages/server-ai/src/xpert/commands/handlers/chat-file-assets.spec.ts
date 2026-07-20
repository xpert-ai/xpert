import { UploadFileCommand } from '@xpert-ai/server-core'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    AttachFileToConversationCommand,
    CreateFileAssetCommand,
    EnqueueFileParseCommand,
    FileAsset,
    GetFileAssetByStorageFileQuery
} from '../../../file-understanding'
import {
    attachChatFileAssetsToConversation,
    getChatMessageFiles,
    normalizeChatHumanInputFiles,
    resolveChatReferenceFileAssets,
    toChatFileAssetReferences,
    toLegacyChatStorageFileAttachments
} from './chat-file-assets'

describe('normalizeChatHumanInputFiles', () => {
    const storageFile = {
        id: 'storage-file-1',
        file: 'contexts/tenant/files-1.png',
        url: 'https://files.example.com/files-1.png',
        originalName: 'wechat-image.png',
        size: 5,
        mimetype: 'image/png',
        storageProvider: 'LOCAL'
    }
    const fileAsset = {
        id: 'file-asset-1',
        storageFileId: storageFile.id,
        originalName: storageFile.originalName,
        mimeType: storageFile.mimetype,
        size: storageFile.size,
        purpose: 'chat_attachment',
        parseMode: 'auto',
        status: 'ready',
        capabilities: ['preview', 'vision']
    } as FileAsset

    it('uploads data URL files and replaces them with FileAsset handles', async () => {
        const commands: unknown[] = []
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                commands.push(command)
                if (command instanceof UploadFileCommand) {
                    return {
                        name: 'wechat-image.png',
                        originalName: 'wechat-image.png',
                        mimeType: 'image/png',
                        size: 5,
                        status: 'success',
                        destinations: [
                            {
                                kind: 'storage',
                                status: 'success',
                                metadata: {
                                    storageFile
                                }
                            }
                        ]
                    }
                }
                if (command instanceof CreateFileAssetCommand) {
                    return {
                        ...fileAsset,
                        status: 'uploaded'
                    }
                }
                if (command instanceof EnqueueFileParseCommand) {
                    return fileAsset
                }
                return null
            })
        }
        const queryBus = {
            execute: jest.fn()
        }
        const dataUrl = `data:image/png;base64,${Buffer.from('hello').toString('base64')}`

        const result = await normalizeChatHumanInputFiles(
            {
                input: 'see image',
                files: [
                    {
                        originalName: 'wechat-image',
                        name: 'wechat-image',
                        fileKey: 'wx-file-1',
                        mimeType: 'image/png',
                        mimetype: 'image/png',
                        fileUrl: dataUrl,
                        url: dataUrl
                    }
                ]
            } as any,
            {
                commandBus: commandBus as any,
                queryBus: queryBus as any,
                context: {
                    conversationId: 'conversation-1',
                    threadId: 'thread-1',
                    projectId: 'project-1',
                    xpertId: 'xpert-1'
                }
            }
        )

        expect(result.changed).toBe(true)
        const normalizedFile = result.input?.files?.[0] as any
        expect(normalizedFile).toMatchObject({
            id: fileAsset.id,
            fileId: fileAsset.id,
            fileAssetId: fileAsset.id,
            storageFileId: storageFile.id,
            originalName: storageFile.originalName,
            mimeType: storageFile.mimetype,
            mimetype: storageFile.mimetype,
            fileUrl: storageFile.url,
            url: storageFile.url,
            status: fileAsset.status,
            parseStatus: fileAsset.status,
            purpose: fileAsset.purpose,
            parseMode: fileAsset.parseMode,
            capabilities: fileAsset.capabilities
        })
        expect(normalizedFile.fileUrl.startsWith('data:')).toBe(false)
        expect(normalizedFile.url.startsWith('data:')).toBe(false)

        const uploadCommand = commands.find((command) => command instanceof UploadFileCommand) as UploadFileCommand
        expect(uploadCommand.input.source).toMatchObject({
            kind: 'buffer',
            originalName: 'wechat-image.png',
            mimeType: 'image/png',
            size: 5
        })
        expect(Buffer.isBuffer((uploadCommand.input.source as any).buffer)).toBe(true)

        const createCommand = commands.find(
            (command) => command instanceof CreateFileAssetCommand
        ) as CreateFileAssetCommand
        expect(createCommand.input).toMatchObject({
            storageFile,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            metadata: {
                source: 'chat_request_data_url',
                fileKey: 'wx-file-1',
                originalName: 'wechat-image'
            }
        })

        const enqueueCommand = commands.find(
            (command) => command instanceof EnqueueFileParseCommand
        ) as EnqueueFileParseCommand
        expect(enqueueCommand.fileAssetId).toBe(fileAsset.id)
        expect(enqueueCommand.options).toEqual({
            runInline: true
        })
    })

    it('resolves storageFileId inputs to existing FileAsset handles', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                expect(query).toBeInstanceOf(GetFileAssetByStorageFileQuery)
                return fileAsset
            })
        }

        const result = await normalizeChatHumanInputFiles(
            {
                input: 'see stored file',
                files: [
                    {
                        storageFileId: storageFile.id,
                        originalName: storageFile.originalName,
                        mimeType: storageFile.mimetype
                    }
                ]
            } as any,
            {
                commandBus: commandBus as any,
                queryBus: queryBus as any
            }
        )

        expect(result.changed).toBe(true)
        expect(result.input?.files?.[0]).toMatchObject({
            id: fileAsset.id,
            fileId: fileAsset.id,
            fileAssetId: fileAsset.id,
            storageFileId: storageFile.id
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('keeps workspace-backed FileAsset handles without entering the data URL conversion path', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }

        const result = await normalizeChatHumanInputFiles(
            {
                input: 'read workspace file',
                files: [
                    {
                        id: 'file-asset-workspace-1',
                        fileAssetId: 'file-asset-workspace-1',
                        filePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
                        workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
                        originalName: 'contract.docx',
                        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    }
                ]
            } as any,
            {
                commandBus: commandBus as any,
                queryBus: queryBus as any
            }
        )

        expect(result.changed).toBe(true)
        expect(result.input?.files?.[0]).toMatchObject({
            id: 'file-asset-workspace-1',
            fileId: 'file-asset-workspace-1',
            fileAssetId: 'file-asset-workspace-1',
            filePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
            workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
            originalName: 'contract.docx'
        })
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })

    it('leaves legacy fileId-only inputs unchanged', async () => {
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn()
        }
        const legacyFile = {
            id: '1780307483877_7txra10ja',
            fileId: '1780307483877_7txra10ja',
            name: 'resumes.zip',
            mimeType: 'application/zip'
        }

        const result = await normalizeChatHumanInputFiles(
            {
                input: 'read file',
                files: [legacyFile]
            } as any,
            {
                commandBus: commandBus as any,
                queryBus: queryBus as any
            }
        )

        expect(result.changed).toBe(false)
        expect(result.input?.files?.[0]).toBe(legacyFile)
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
    })
})

describe('chat file asset persistence helpers', () => {
    it('resolves pasted image references through their StorageFile ids', async () => {
        const storageFile = {
            id: 'storage-file-reference-1',
            url: 'https://files.example.com/diagram.png',
            mimetype: 'image/png',
            size: 857
        }
        const fileAsset = {
            id: 'file-asset-reference-1',
            storageFileId: storageFile.id,
            originalName: 'diagram.png',
            mimeType: storageFile.mimetype,
            size: storageFile.size,
            purpose: 'chat_attachment',
            parseMode: 'auto',
            status: 'ready',
            capabilities: ['preview', 'vision']
        } as FileAsset
        const commandBus = {
            execute: jest.fn()
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                expect(query).toBeInstanceOf(GetFileAssetByStorageFileQuery)
                return fileAsset
            })
        }

        const files = await resolveChatReferenceFileAssets(
            [
                {
                    type: 'image',
                    text: 'Pasted image: diagram.png',
                    fileId: storageFile.id,
                    url: storageFile.url,
                    mimeType: storageFile.mimetype,
                    name: 'diagram.png',
                    size: storageFile.size
                },
                {
                    type: 'image',
                    text: 'Duplicate pasted image',
                    fileId: storageFile.id
                }
            ],
            {
                commandBus: commandBus as unknown as CommandBus,
                queryBus: queryBus as unknown as QueryBus
            }
        )

        expect(files).toEqual([
            expect.objectContaining({
                id: fileAsset.id,
                fileId: fileAsset.id,
                fileAssetId: fileAsset.id,
                storageFileId: storageFile.id,
                originalName: 'diagram.png'
            })
        ])
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('extracts FileAsset relation stubs and ignores duplicate or legacy-only ids', () => {
        expect(
            toChatFileAssetReferences([
                { fileAssetId: 'asset-1', storageFileId: 'storage-1' },
                { fileAssetId: 'asset-1', storageFileId: 'storage-1' },
                { fileId: 'asset-2', storageFileId: 'storage-2' },
                { id: 'legacy-upload-id', fileId: 'legacy-upload-id' }
            ])
        ).toEqual([{ id: 'asset-1' }, { id: 'asset-2' }])
    })

    it('keeps only legacy StorageFile-shaped attachments for the deprecated bridge', () => {
        expect(
            toLegacyChatStorageFileAttachments([
                { id: 'legacy-storage-1', originalName: 'old.pdf' },
                { id: 'asset-1', fileAssetId: 'asset-1', storageFileId: 'storage-1' },
                {
                    id: 'workspace-asset-1',
                    fileId: 'workspace-asset-1',
                    fileAssetId: 'workspace-asset-1',
                    filePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
                    workspacePath: 'files/wechat/integration-1/uuid-1/msg-1/contract.docx',
                    originalName: 'contract.docx'
                },
                {
                    id: 'workspace-asset-2',
                    fileId: 'workspace-asset-2',
                    workspacePath: 'files/wechat/integration-1/uuid-1/msg-2/contract.docx',
                    originalName: 'contract.docx'
                },
                { name: 'missing-id.txt' }
            ])
        ).toEqual([
            expect.objectContaining({
                id: 'legacy-storage-1',
                originalName: 'old.pdf'
            })
        ])
    })

    it('reconstructs retry files from FileAsset relations before legacy attachments', () => {
        expect(
            getChatMessageFiles({
                fileAssets: [
                    {
                        id: 'asset-1',
                        storageFileId: 'storage-1',
                        originalName: 'image.png',
                        mimeType: 'image/png',
                        status: 'ready',
                        parseMode: 'auto',
                        purpose: 'chat_attachment',
                        capabilities: ['preview']
                    }
                ],
                attachments: [{ id: 'legacy-storage-1', file: 'files/old.pdf', originalName: 'old.pdf' }]
            } as any)
        ).toEqual([
            expect.objectContaining({
                id: 'asset-1',
                fileId: 'asset-1',
                storageFileId: 'storage-1',
                originalName: 'image.png'
            }),
            expect.objectContaining({
                id: 'legacy-storage-1'
            })
        ])
    })

    it('attaches FileAsset handles to the conversation boundary', async () => {
        const commandBus = {
            execute: jest.fn()
        }

        await attachChatFileAssetsToConversation(
            commandBus as any,
            { id: 'conversation-1', threadId: 'thread-1' },
            [{ fileAssetId: 'asset-1', storageFileId: 'storage-1' }],
            {
                projectId: 'project-1',
                xpertId: 'xpert-1',
                sandboxEnvironmentId: 'environment-1',
                sandboxProvider: 'local'
            }
        )

        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        const command = commandBus.execute.mock.calls[0][0]
        expect(command).toBeInstanceOf(AttachFileToConversationCommand)
        expect(command.input).toMatchObject({
            fileAssetId: 'asset-1',
            storageFileId: 'storage-1',
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            projectId: 'project-1',
            xpertId: 'xpert-1',
            sandboxEnvironmentId: 'environment-1',
            sandboxProvider: 'local'
        })
    })
})
