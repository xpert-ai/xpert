jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getUser: jest.fn()
    },
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        constructor(public readonly repository?: unknown) {}

        findOne(): Promise<T> {
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

import { TFile } from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { WorkspaceVolumeClient } from '../shared/volume/workspace-volume'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'

describe('ChatConversationService workspace files', () => {
    let service: ChatConversationService
    const conversation = {
        id: 'conversation-1',
        tenantId: 'tenant-1',
        createdById: 'user-1',
        threadId: 'thread-1'
    } satisfies Pick<ChatConversation, 'id' | 'tenantId' | 'createdById' | 'threadId'>

    beforeEach(() => {
        service = new ChatConversationService(
            {} as Repository<ChatConversation>,
            {} as ChatMessageService,
            {} as CommandBus,
            {} as QueryBus,
            {} as Queue
        )
        jest.spyOn(service, 'findOne').mockResolvedValue(conversation as ChatConversation)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('lists files inside the current conversation workspace', async () => {
        const listWorkspace = jest.spyOn(WorkspaceVolumeClient.prototype, 'list').mockResolvedValue([])

        await service.getWorkspaceFiles('conversation-1', 'docs', 2)

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(listWorkspace).toHaveBeenCalledWith('thread-1', {
            path: 'docs',
            deepth: 2
        })
    })

    it('reads files inside the current conversation workspace', async () => {
        const readWorkspaceFile = jest.spyOn(WorkspaceVolumeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'README.md'
        } as TFile)

        await service.readWorkspaceFile('conversation-1', 'README.md')

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(readWorkspaceFile).toHaveBeenCalledWith('thread-1', 'README.md')
    })

    it('saves files inside the current conversation workspace', async () => {
        const saveWorkspaceFile = jest.spyOn(WorkspaceVolumeClient.prototype, 'saveFile').mockResolvedValue({
            filePath: 'README.md',
            contents: '# Updated\n'
        } as TFile)

        await service.saveWorkspaceFile('conversation-1', 'README.md', '# Updated\n')

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(saveWorkspaceFile).toHaveBeenCalledWith('thread-1', 'README.md', '# Updated\n')
    })

    it('finds the conversation by thread id inside the current scope', async () => {
        await service.findOneByThreadId('thread-1')

        expect(service.findOne).toHaveBeenCalledWith({
            where: {
                threadId: 'thread-1'
            }
        })
    })
})
