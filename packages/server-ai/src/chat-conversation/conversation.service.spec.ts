jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn(),
        getOrganizationId: jest.fn(),
        getUser: jest.fn()
    },
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        constructor(public readonly repository?: unknown) {}

        findOne(): Promise<T> {
            return Promise.resolve(null)
        }

        findOneByOptions(): Promise<T> {
            return Promise.resolve(null)
        }

        findAll() {
            return Promise.resolve({ items: [], total: 0 })
        }
    }
}))

jest.mock('../chat-message/chat-message.service', () => ({
    ChatMessageService: class ChatMessageService {}
}))

jest.mock('../copilot-store', () => ({
    CreateCopilotStoreCommand: class CreateCopilotStoreCommand {}
}))

jest.mock('../xpert-agent-execution/queries', () => ({
    FindAgentExecutionsQuery: class FindAgentExecutionsQuery {},
    XpertAgentExecutionStateQuery: class XpertAgentExecutionStateQuery {}
}))

jest.mock('./conversation.entity', () => ({
    ChatConversation: class ChatConversation {}
}))

jest.mock('./dto', () => ({
    ChatConversationPublicDTO: class ChatConversationPublicDTO {
        constructor(data?: object) {
            Object.assign(this, data)
        }
    }
}))

import { TFile } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { GetFileAssetQuery } from '../file-understanding/queries'
import { VolumeClient } from '../shared/volume'
import { VolumeSubtreeClient } from '../shared/volume/volume-subtree'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'

describe('ChatConversationService workspace files', () => {
    let repository: { findOne: jest.Mock; query: jest.Mock }
    let readStateRepository: {
        create: jest.Mock
        findOne: jest.Mock
        manager: {
            transaction: jest.Mock
        }
        save: jest.Mock
        query: jest.Mock
    }
    let messageService: {
        findAll: jest.Mock
        findOneByOptions: jest.Mock
    }
    let volumeClient: jest.Mocked<Pick<VolumeClient, 'resolve' | 'resolveRoot'>>
    let queryBus: { execute: jest.Mock }
    let service: ChatConversationService
    const conversation = {
        id: 'conversation-1',
        tenantId: 'tenant-1',
        createdById: 'user-1',
        threadId: 'thread-1',
        xpertId: 'xpert-1'
    } satisfies Pick<ChatConversation, 'id' | 'tenantId' | 'createdById' | 'threadId'> & {
        xpertId: string
    }

    beforeEach(() => {
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')

        repository = {
            findOne: jest.fn(),
            query: jest.fn()
        } as any
        readStateRepository = {
            create: jest.fn((entity) => entity),
            findOne: jest.fn().mockResolvedValue(null),
            manager: {
                transaction: jest.fn()
            },
            save: jest.fn(async (entity) => entity),
            query: jest.fn().mockResolvedValue([
                {
                    id: 'read-state-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    conversationId: 'conversation-1',
                    userId: 'user-1',
                    lastReadAt: new Date('2026-06-21T00:10:00.000Z'),
                    lastReadMessageId: 'message-1'
                }
            ])
        }
        readStateRepository.manager.transaction.mockImplementation((callback) =>
            callback({
                query: readStateRepository.query
            })
        )
        messageService = {
            findAll: jest.fn().mockResolvedValue({ items: [] }),
            findOneByOptions: jest.fn()
        }

        volumeClient = {
            resolve: jest.fn().mockReturnValue({
                path: jest.fn().mockReturnValue('/workspace/root'),
                publicUrl: jest.fn().mockReturnValue('/workspace/public')
            }),
            resolveRoot: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        service = new ChatConversationService(
            repository as unknown as Repository<ChatConversation>,
            readStateRepository as any,
            messageService as unknown as ChatMessageService,
            {} as CommandBus,
            queryBus as unknown as QueryBus,
            {} as Queue,
            volumeClient
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('lists files inside the current conversation workspace', async () => {
        const findConversation = jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        const listWorkspace = jest.spyOn(VolumeSubtreeClient.prototype, 'list').mockResolvedValue([])

        await service.getWorkspaceFiles('conversation-1', 'docs', 2)

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(listWorkspace).toHaveBeenCalledWith('', {
            path: 'docs',
            deepth: 2
        })
    })

    it('aggregates unread ai messages by xpert for the current user and organization', async () => {
        repository.query.mockResolvedValue([
            {
                xpertId: 'xpert-1',
                unreadMessages: '2',
                unreadConversations: '1',
                latestUnreadAt: '2026-06-21T00:00:00.000Z',
                latestUnreadConversationId: 'conversation-unread',
                latestUnreadThreadId: 'thread-unread',
                latestConversationAt: '2026-06-21T00:05:00.000Z',
                latestConversationId: 'conversation-latest',
                latestConversationThreadId: 'thread-latest',
                latestConversationTitle: 'Latest planning chat'
            }
        ])

        const result = await service.getUnreadByXperts(['xpert-1', 'xpert-1', ''])

        expect(repository.query).toHaveBeenCalledWith(expect.stringContaining(`m.role = 'ai'`), [
            'tenant-1',
            'user-1',
            'org-1',
            'xpert-1'
        ])
        const sql = repository.query.mock.calls[0][0]
        expect(sql).toContain('WITH scoped_conversations AS')
        expect(sql).toContain('latest_read_state AS')
        expect(sql).toContain('conversation_cursors AS')
        expect(sql).toContain('c."createdById" = $2')
        expect(sql).toContain('c."organizationId" = $3')
        expect(sql).toContain('rs."organizationId" = $3')
        expect(sql).toContain('SELECT DISTINCT ON (rs."conversationId")')
        expect(sql).toContain('SELECT DISTINCT ON ("xpertId")')
        expect(sql).toContain('latest_conversations AS')
        expect(sql).toContain('CROSS JOIN LATERAL')
        expect(sql).not.toContain('LEFT JOIN LATERAL')
        expect(sql).not.toContain('array_agg')
        expect(sql).not.toContain('IS NOT DISTINCT FROM')
        expect(sql).toContain('read_cursor.id::text = rs."lastReadMessageId"')
        expect(sql).toContain('COALESCE(read_cursor."createdAt", rs."lastReadAt", c."updatedAt", c."createdAt")')
        expect(sql).toContain('m."createdAt" > c."cursorAt"')
        expect(sql).toContain('AS "latestUnreadConversationId"')
        expect(sql).toContain('AS "latestUnreadThreadId"')
        expect(sql).toContain('AS "latestConversationTitle"')
        expect(sql).toContain('FROM latest_conversations')
        expect(sql).toContain('LEFT JOIN counts')
        expect(sql).toContain('LEFT JOIN latest')
        expect(result).toEqual([
            {
                xpertId: 'xpert-1',
                unreadMessages: 2,
                unreadConversations: 1,
                latestUnreadAt: '2026-06-21T00:00:00.000Z',
                latestUnreadConversationId: 'conversation-unread',
                latestUnreadThreadId: 'thread-unread',
                latestConversationAt: '2026-06-21T00:05:00.000Z',
                latestConversationId: 'conversation-latest',
                latestConversationThreadId: 'thread-latest',
                latestConversationTitle: 'Latest planning chat'
            }
        ])
    })

    it('returns latest conversation titles when there are no unread messages', async () => {
        repository.query.mockResolvedValue([
            {
                xpertId: 'xpert-1',
                unreadMessages: '0',
                unreadConversations: '0',
                latestConversationAt: '2026-06-21T00:05:00.000Z',
                latestConversationId: 'conversation-latest',
                latestConversationThreadId: 'thread-latest',
                latestConversationTitle: 'Latest planning chat'
            }
        ])

        const result = await service.getUnreadByXperts(['xpert-1'])

        expect(result).toEqual([
            {
                xpertId: 'xpert-1',
                unreadMessages: 0,
                unreadConversations: 0,
                latestUnreadAt: null,
                latestUnreadConversationId: null,
                latestUnreadThreadId: null,
                latestConversationAt: '2026-06-21T00:05:00.000Z',
                latestConversationId: 'conversation-latest',
                latestConversationThreadId: 'thread-latest',
                latestConversationTitle: 'Latest planning chat'
            }
        ])
    })

    it('skips unread aggregation when there is no valid xpert id', async () => {
        const result = await service.getUnreadByXperts(['', '   '])

        expect(result).toEqual([])
        expect(repository.query).not.toHaveBeenCalled()
    })

    it('uses tenant scoped unread SQL when there is no current organization', async () => {
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
        repository.query.mockResolvedValue([])

        await service.getUnreadByXperts(['xpert-1'])

        expect(repository.query).toHaveBeenCalledWith(expect.any(String), ['tenant-1', 'user-1', 'xpert-1'])
        const sql = repository.query.mock.calls[0][0]
        expect(sql).toContain('c."organizationId" IS NULL')
        expect(sql).toContain('rs."organizationId" IS NULL')
        expect(sql).not.toContain('IS NOT DISTINCT FROM')
    })

    it('marks a conversation read at the provided message cursor', async () => {
        jest.spyOn(service, 'findOneByOptions').mockResolvedValue({
            ...conversation,
            organizationId: 'org-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            updatedAt: new Date('2026-06-21T00:05:00.000Z')
        } as ChatConversation)
        messageService.findOneByOptions.mockResolvedValue({
            id: 'message-1',
            conversationId: 'conversation-1',
            createdAt: new Date('2026-06-21T00:10:00.000Z')
        })

        await service.markRead('conversation-1', 'message-1')

        expect(messageService.findOneByOptions).toHaveBeenCalledWith({
            where: {
                id: 'message-1',
                conversationId: 'conversation-1'
            }
        })
        expect(readStateRepository.query).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT ("tenantId", "organizationId", "conversationId", "userId")'),
            ['tenant-1', 'org-1', 'conversation-1', 'user-1', new Date('2026-06-21T00:10:00.000Z'), 'message-1']
        )
    })

    it('marks a conversation read at the latest message when no cursor is provided', async () => {
        jest.spyOn(service, 'findOneByOptions').mockResolvedValue({
            ...conversation,
            organizationId: 'org-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z')
        } as ChatConversation)
        messageService.findAll.mockResolvedValue({
            items: [
                {
                    id: 'latest-message',
                    conversationId: 'conversation-1',
                    createdAt: new Date('2026-06-21T00:12:00.000Z')
                }
            ]
        })

        await service.markRead('conversation-1')

        expect(messageService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    conversationId: 'conversation-1'
                },
                take: 1
            })
        )
        expect(readStateRepository.query).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT ("tenantId", "organizationId", "conversationId", "userId")'),
            ['tenant-1', 'org-1', 'conversation-1', 'user-1', new Date('2026-06-21T00:12:00.000Z'), 'latest-message']
        )
    })

    it('updates tenant scoped read states without requiring a partial unique index', async () => {
        jest.spyOn(service, 'findOneByOptions').mockResolvedValue({
            ...conversation,
            organizationId: null,
            createdAt: new Date('2026-06-21T00:00:00.000Z')
        } as ChatConversation)

        await service.markRead('conversation-1')

        expect(readStateRepository.manager.transaction).toHaveBeenCalledTimes(1)
        expect(readStateRepository.query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_advisory_xact_lock'), [
            'tenant-1',
            'conversation-1:user-1'
        ])
        expect(readStateRepository.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('UPDATE chat_conversation_read_state rs'),
            ['tenant-1', null, 'conversation-1', 'user-1', new Date('2026-06-21T00:00:00.000Z'), null]
        )
        const sql = readStateRepository.query.mock.calls[1][0]
        expect(sql).toContain('WHERE')
        expect(sql).toContain('rs."organizationId" IS NULL')
        expect(sql).toContain('UPDATE chat_conversation_read_state rs')
        expect(sql).toContain('INSERT INTO chat_conversation_read_state')
        expect(sql).not.toContain('ON CONFLICT ("tenantId", "conversationId", "userId")')
    })

    it('uses the sandbox environment workspace when the conversation has a sandbox environment id', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
            ...conversation,
            projectId: 'project-1',
            options: {
                sandboxEnvironmentId: 'sandbox-env-1'
            }
        } as ChatConversation)
        jest.spyOn(VolumeSubtreeClient.prototype, 'list').mockResolvedValue([])

        await service.getWorkspaceFiles('conversation-1', '/4567', 1)

        expect(volumeClient.resolve).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            catalog: 'environment',
            environmentId: 'sandbox-env-1',
            userId: 'user-1'
        })
    })

    it('reads files inside the current conversation workspace', async () => {
        const findConversation = jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        const readWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'README.md'
        } as TFile)

        await service.readWorkspaceFile('conversation-1', 'README.md')

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(readWorkspaceFile).toHaveBeenCalledWith('', 'README.md')
    })

    it('resolves agent-visible file paths through file asset workspace metadata', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        queryBus.execute.mockResolvedValue({
            id: 'file-asset-1',
            conversationId: 'conversation-1',
            workspacePath: '/workspace/sessions/conversation-1/files/file-asset-1/report.pdf',
            metadata: {
                workspace: {
                    relativePath: 'sessions/conversation-1/files/file-asset-1/report.pdf'
                }
            }
        })
        const readWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'sessions/conversation-1/files/file-asset-1/report.pdf'
        } as TFile)

        await service.readWorkspaceFile(
            'conversation-1',
            '/workspace/sessions/conversation-1/files/file-asset-1/report.pdf',
            'file-asset-1'
        )

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetFileAssetQuery))
        expect(readWorkspaceFile).toHaveBeenCalledWith('', 'sessions/conversation-1/files/file-asset-1/report.pdf')
    })

    it('normalizes agent-visible workspace paths without file asset metadata', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        const readWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reports/report.pdf'
        } as TFile)

        await service.readWorkspaceFile('conversation-1', '/workspace/reports/report.pdf')

        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(readWorkspaceFile).toHaveBeenCalledWith('', 'reports/report.pdf')
    })

    it('rejects file assets that belong to another conversation', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        queryBus.execute.mockResolvedValue({
            id: 'file-asset-1',
            conversationId: 'conversation-2',
            metadata: {
                workspace: {
                    relativePath: 'sessions/conversation-2/files/file-asset-1/report.pdf'
                }
            }
        })
        const readWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile')

        await expect(
            service.readWorkspaceFile('conversation-1', '/workspace/report.pdf', 'file-asset-1')
        ).rejects.toThrow('Conversation file not found')
        expect(readWorkspaceFile).not.toHaveBeenCalled()
    })

    it('returns download targets inside the current conversation workspace', async () => {
        const findConversation = jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        const getDownloadTarget = jest.spyOn(VolumeSubtreeClient.prototype, 'getDownloadTarget').mockResolvedValue({
            absolutePath: '/workspace/root/docs',
            fileName: 'docs.zip',
            mimeType: 'application/zip',
            type: 'directory'
        })

        await service.getWorkspaceFileDownload('conversation-1', 'docs')

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(getDownloadTarget).toHaveBeenCalledWith('', 'docs')
    })

    it('saves files inside the current conversation workspace', async () => {
        const findConversation = jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
        const saveWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'saveFile').mockResolvedValue({
            filePath: 'README.md',
            contents: '# Updated\n'
        } as TFile)

        await service.saveWorkspaceFile('conversation-1', 'README.md', '# Updated\n')

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(saveWorkspaceFile).toHaveBeenCalledWith('', 'README.md', '# Updated\n')
    })

    it('rejects non-project workspace access when the conversation is not bound to an xpert', async () => {
        jest.spyOn(service, 'findOne').mockResolvedValue({
            ...conversation,
            xpertId: null
        } as ChatConversation)

        await expect(service.getWorkspaceFiles('conversation-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('finds the conversation by thread id inside the current scope', async () => {
        const findOneByOptions = jest
            .spyOn(service, 'findOneByOptions')
            .mockResolvedValue(conversation as ChatConversation)

        await service.findOneByThreadId('thread-1')

        expect(findOneByOptions).toHaveBeenCalledWith({
            where: {
                threadId: 'thread-1'
            }
        })
    })
})
