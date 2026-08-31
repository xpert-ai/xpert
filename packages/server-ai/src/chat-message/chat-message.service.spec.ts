jest.mock('@xpert-ai/server-core', () => ({
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        constructor(protected readonly repository: { findOne: jest.Mock }) {}

        findOne(id: string, options?: { relations?: string[] }): Promise<T> {
            return this.repository.findOne({ where: { id }, ...(options ?? {}) })
        }
    }
}))

jest.mock('./chat-message.entity', () => ({
    ChatMessage: class ChatMessage {}
}))

jest.mock('../chat-conversation/queries', () => ({
    AssertChatConversationAccessQuery: class AssertChatConversationAccessQuery {
        constructor(
            public readonly where: { id: string },
            public readonly operation: string
        ) {}
    }
}))

jest.mock('../file-understanding/queries', () => ({
    GetOwnedStorageFileQuery: class GetOwnedStorageFileQuery {
        constructor(public readonly storageFileId: string) {}
    },
    ResolveAuthorizedFileAssetQuery: class ResolveAuthorizedFileAssetQuery {
        constructor(public readonly input: unknown) {}
    }
}))

import { ForbiddenException } from '@nestjs/common'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries'
import { GetOwnedStorageFileQuery, ResolveAuthorizedFileAssetQuery } from '../file-understanding/queries'
import { ChatMessageService } from './chat-message.service'

describe('ChatMessageService file relation access', () => {
    it('rejects before loading requested file relations when conversation access fails', async () => {
        const repository = {
            findOne: jest.fn().mockResolvedValue({ id: 'message-1', conversationId: 'conversation-1' })
        }
        const queryBus = { execute: jest.fn().mockRejectedValue(new ForbiddenException()) }
        const service = new ChatMessageService(repository as never, {} as never, queryBus as never)

        await expect(
            service.findOneAuthorized('message-1', { relations: ['attachments', 'fileAssets'] })
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(AssertChatConversationAccessQuery))
        expect(repository.findOne).toHaveBeenCalledTimes(1)
    })

    it('loads relations only after the owning conversation is authorized', async () => {
        const scopedMessage = { id: 'message-1', conversationId: 'conversation-1' }
        const authorizedMessage = {
            ...scopedMessage,
            attachments: [{ id: 'storage-file-1' }],
            fileAssets: [{ id: 'file-asset-1' }]
        }
        const repository = {
            findOne: jest.fn().mockResolvedValueOnce(scopedMessage).mockResolvedValueOnce(authorizedMessage)
        }
        const queryBus = { execute: jest.fn().mockResolvedValue({ id: 'conversation-1' }) }
        const service = new ChatMessageService(repository as never, {} as never, queryBus as never)

        await expect(
            service.findOneAuthorized('message-1', { relations: ['attachments', 'fileAssets'] })
        ).resolves.toBe(authorizedMessage)

        expect(repository.findOne).toHaveBeenNthCalledWith(2, {
            where: { id: 'message-1' },
            relations: ['attachments', 'fileAssets']
        })
    })

    it('removes file relations that the current conversation actor cannot read', async () => {
        const message = {
            id: 'message-1',
            conversationId: 'conversation-1',
            attachments: [{ id: 'victim-storage-file' }],
            fileAssets: [{ id: 'victim-file-asset' }]
        }
        const queryBus = { execute: jest.fn().mockRejectedValue(new ForbiddenException()) }
        const service = new ChatMessageService({} as never, {} as never, queryBus as never)

        await expect(service.filterAuthorizedFileRelations(message as never, 'conversation-1')).resolves.toMatchObject({
            attachments: [],
            fileAssets: []
        })

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(ResolveAuthorizedFileAssetQuery))
    })

    it('returns canonical entities from the owner and conversation authorization queries', async () => {
        const message = {
            id: 'message-1',
            conversationId: 'conversation-1',
            attachments: [{ id: 'storage-file-1', originalName: 'client value' }],
            fileAssets: [{ id: 'file-asset-1', originalName: 'client value' }]
        }
        const canonicalStorageFile = { id: 'storage-file-1', originalName: 'canonical legacy file' }
        const canonicalFileAsset = { id: 'file-asset-1', originalName: 'canonical asset' }
        const queryBus = {
            execute: jest.fn((query) =>
                Promise.resolve(
                    query instanceof GetOwnedStorageFileQuery ? canonicalStorageFile : { asset: canonicalFileAsset }
                )
            )
        }
        const service = new ChatMessageService({} as never, {} as never, queryBus as never)

        await expect(service.filterAuthorizedFileRelations(message as never, 'conversation-1')).resolves.toMatchObject({
            attachments: [canonicalStorageFile],
            fileAssets: [canonicalFileAsset]
        })
    })

    it('rejects a message from a different conversation before resolving file relations', async () => {
        const queryBus = { execute: jest.fn() }
        const service = new ChatMessageService({} as never, {} as never, queryBus as never)

        await expect(
            service.filterAuthorizedFileRelations(
                {
                    id: 'message-1',
                    conversationId: 'conversation-2',
                    attachments: [{ id: 'storage-file-1' }]
                } as never,
                'conversation-1'
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).not.toHaveBeenCalled()
    })
})
