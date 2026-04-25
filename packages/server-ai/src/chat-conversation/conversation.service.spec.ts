jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        currentUserId: jest.fn(),
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
import { VolumeSubtreeClient } from '../shared/volume/volume-subtree'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'

describe('ChatConversationService workspace files', () => {
    let repository: { findOne: jest.Mock }
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

        repository = {
            findOne: jest.fn()
        }

        service = new ChatConversationService(
            repository as unknown as Repository<ChatConversation>,
            {} as ChatMessageService,
            {} as CommandBus,
            {} as QueryBus,
            {} as Queue,
            {
                resolve: jest.fn().mockReturnValue({
                    path: jest.fn().mockReturnValue('/workspace/root'),
                    publicUrl: jest.fn().mockReturnValue('/workspace/public')
                })
            } as any
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('lists files inside the current conversation workspace', async () => {
        const findConversation = jest
            .spyOn(service, 'findOne')
            .mockResolvedValue(conversation as ChatConversation)
        const listWorkspace = jest.spyOn(VolumeSubtreeClient.prototype, 'list').mockResolvedValue([])

        await service.getWorkspaceFiles('conversation-1', 'docs', 2)

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(listWorkspace).toHaveBeenCalledWith('', {
            path: 'docs',
            deepth: 2
        })
    })

    it('reads files inside the current conversation workspace', async () => {
        const findConversation = jest
            .spyOn(service, 'findOne')
            .mockResolvedValue(conversation as ChatConversation)
        const readWorkspaceFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'README.md'
        } as TFile)

        await service.readWorkspaceFile('conversation-1', 'README.md')

        expect(findConversation).toHaveBeenCalledWith('conversation-1')
        expect(readWorkspaceFile).toHaveBeenCalledWith('', 'README.md')
    })

    it('saves files inside the current conversation workspace', async () => {
        const findConversation = jest
            .spyOn(service, 'findOne')
            .mockResolvedValue(conversation as ChatConversation)
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
        const findOneByOptions = jest.spyOn(service, 'findOneByOptions').mockResolvedValue(conversation as ChatConversation)

        await service.findOneByThreadId('thread-1')

        expect(findOneByOptions).toHaveBeenCalledWith({
            where: {
                threadId: 'thread-1'
            }
        })
    })
})
