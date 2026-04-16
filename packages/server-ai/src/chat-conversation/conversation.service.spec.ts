jest.mock('@xpert-ai/server-core', () => ({
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

jest.mock('@xpert-ai/server-config', () => ({
    environment: {
        env: {
            IS_DOCKER: 'true'
        },
        envName: 'prod',
        baseUrl: 'http://localhost:3000'
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
import fsPromises from 'fs/promises'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import * as sharedUtils from '../shared/utils/utils'
import { VolumeClient } from '../shared/volume'
import { WorkspaceVolumeClient } from '../shared/volume/workspace-volume'
import { ChatConversation } from './conversation.entity'
import { ChatConversationService } from './conversation.service'

describe('ChatConversationService workspace files', () => {
    let service: ChatConversationService
    const userConversation = {
        id: 'conversation-1',
        tenantId: 'tenant-1',
        createdById: 'user-1',
        threadId: 'thread-1'
    } satisfies Pick<ChatConversation, 'id' | 'tenantId' | 'createdById' | 'threadId'>
    const projectConversation = {
        ...userConversation,
        projectId: 'project-1'
    } satisfies Pick<ChatConversation, 'id' | 'tenantId' | 'createdById' | 'threadId' | 'projectId'>

    beforeEach(() => {
        service = new ChatConversationService(
            {} as Repository<ChatConversation>,
            {} as ChatMessageService,
            {} as CommandBus,
            {} as QueryBus,
            {} as Queue
        )
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('lists files inside the current conversation workspace', async () => {
        const listWorkspace = jest.spyOn(WorkspaceVolumeClient.prototype, 'list').mockResolvedValue([])
        jest.spyOn(service, 'findOne').mockResolvedValue(userConversation as ChatConversation)

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
        jest.spyOn(service, 'findOne').mockResolvedValue(userConversation as ChatConversation)

        await service.readWorkspaceFile('conversation-1', 'README.md')

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(readWorkspaceFile).toHaveBeenCalledWith('thread-1', 'README.md')
    })

    it('saves files inside the current conversation workspace', async () => {
        const saveWorkspaceFile = jest.spyOn(WorkspaceVolumeClient.prototype, 'saveFile').mockResolvedValue({
            filePath: 'README.md',
            contents: '# Updated\n'
        } as TFile)
        jest.spyOn(service, 'findOne').mockResolvedValue(userConversation as ChatConversation)

        await service.saveWorkspaceFile('conversation-1', 'README.md', '# Updated\n')

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(saveWorkspaceFile).toHaveBeenCalledWith('thread-1', 'README.md', '# Updated\n')
    })

    it('uses the project workspace root for project conversations', async () => {
        const getVolumePath = jest.spyOn(VolumeClient.prototype, 'getVolumePath')
        const getPublicUrl = jest.spyOn(VolumeClient.prototype, 'getPublicUrl')
        const listFiles = jest.spyOn(sharedUtils, 'listFiles').mockResolvedValue([])
        jest.spyOn(service, 'findOne').mockResolvedValue(projectConversation as ChatConversation)

        await service.getWorkspaceFiles('conversation-1', 'docs', 2)

        expect(service.findOne).toHaveBeenCalledWith('conversation-1')
        expect(getVolumePath).toHaveReturnedWith('/sandbox/tenant-1/project/project-1')
        expect(getPublicUrl).toHaveReturnedWith('http://localhost:3000/api/sandbox/volume/project/project-1')
        expect(listFiles).toHaveBeenCalledWith('docs', 2, 0, {
            root: '/sandbox/tenant-1/project/project-1',
            baseUrl: 'http://localhost:3000/api/sandbox/volume/project/project-1'
        })
    })

    it('reads files from the project workspace root for project conversations', async () => {
        const modifiedAt = new Date('2024-01-01T00:00:00.000Z')
        const stat = {
            isFile: () => true,
            size: 9,
            mtime: modifiedAt
        } as Awaited<ReturnType<typeof fsPromises.stat>>
        jest.spyOn(service, 'findOne').mockResolvedValue(projectConversation as ChatConversation)
        jest.spyOn(fsPromises, 'stat').mockResolvedValue(stat)
        jest.spyOn(fsPromises, 'readFile').mockResolvedValue(Buffer.from('# Project'))

        const file = await service.readWorkspaceFile('conversation-1', 'README.md')

        expect(fsPromises.stat).toHaveBeenCalledWith('/sandbox/tenant-1/project/project-1/README.md')
        expect(fsPromises.readFile).toHaveBeenCalledWith('/sandbox/tenant-1/project/project-1/README.md')
        expect(file).toMatchObject({
            filePath: 'README.md',
            contents: '# Project',
            url: 'http://localhost:3000/api/sandbox/volume/project/project-1/README.md'
        })
    })

    it('saves files into the project workspace root for project conversations', async () => {
        const modifiedAt = new Date('2024-01-01T00:00:00.000Z')
        const stat = {
            isFile: () => true,
            size: 10,
            mtime: modifiedAt
        } as Awaited<ReturnType<typeof fsPromises.stat>>
        jest.spyOn(service, 'findOne').mockResolvedValue(projectConversation as ChatConversation)
        jest.spyOn(fsPromises, 'stat').mockResolvedValue(stat)
        jest.spyOn(fsPromises, 'readFile')
            .mockResolvedValueOnce(Buffer.from('# Project'))
            .mockResolvedValueOnce(Buffer.from('# Updated\n'))
        jest.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined)

        const file = await service.saveWorkspaceFile('conversation-1', 'README.md', '# Updated\n')

        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            '/sandbox/tenant-1/project/project-1/README.md',
            '# Updated\n',
            'utf8'
        )
        expect(file).toMatchObject({
            filePath: 'README.md',
            contents: '# Updated\n',
            url: 'http://localhost:3000/api/sandbox/volume/project/project-1/README.md'
        })
    })

    it('finds the conversation by thread id inside the current scope', async () => {
        const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(null)

        await service.findOneByThreadId('thread-1')

        expect(findOne).toHaveBeenCalledWith({
            where: {
                threadId: 'thread-1'
            }
        })
    })
})
