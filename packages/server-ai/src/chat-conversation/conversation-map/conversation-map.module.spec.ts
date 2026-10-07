import { ForbiddenException, Global, Module, type DynamicModule, type ValueProvider } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { DiscoveryModule, DiscoveryService } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { Test, type TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    AGENT_WORKBENCH_SLOT,
    type TConversationBranchRequest,
    type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ServerAIModule, ConversationBranchModule, ConversationMapModule } from '../../index'
import { AIModule } from '../../ai/ai.module'
import { ConversationBranchController } from '../../ai/conversation-branch.controller'
import { ConversationDTO } from '../../ai/dto/conversation.dto'
import { ChatMessageModule } from '../../chat-message/chat-message.module'
import { ChatMessageService } from '../../chat-message/chat-message.service'
import { CopilotCheckpointModule } from '../../copilot-checkpoint/copilot-checkpoint.module'
import { CopilotCheckpointSaver } from '../../copilot-checkpoint/checkpoint-saver'
import { FileUnderstandingModule } from '../../file-understanding/file-understanding.module'
import { FileAssetAccessService } from '../../file-understanding/file-asset-access.service'
import { XpertModule } from '../../xpert/xpert.module'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProjectModule } from '../../xpert-project/project.module'
import { XpertProjectService } from '../../xpert-project/project.service'
import { XpertProjectAccessModule } from '../../xpert-project/project-access.module'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { ChatConversationModule } from '../conversation.module'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { WorkbenchAssistantConversationNavigationService } from '../workbench-assistant-conversation-navigation.service'
import { ConversationBranchService } from '../conversation-branch/conversation-branch.service'
import { ConversationBranchHandler } from '../conversation-branch/branch.handler'
import { ConversationMapViewProvider } from './provider'
import { ConversationMapService } from './service'

// Replace infrastructure at its exported module boundaries, keeping the actual feature wiring and CQRS bus.
function boundary(providers: ValueProvider[]): DynamicModule {
    @Module({})
    class BoundaryModule {}
    return { module: BoundaryModule, providers, exports: providers.map(({ provide }) => provide) }
}

@Global()
@Module({ providers: [{ provide: DataSource, useValue: {} }], exports: [DataSource] })
class TestDatabaseModule {}

describe('Conversation feature module boundaries', () => {
    let module: TestingModule
    const conversationId = randomUUID()
    const target = Object.assign(new ChatConversation(), { id: randomUUID(), threadId: 'target', title: 'Fork' })
    const input: TConversationBranchRequest = {
        sourceThreadId: 'source',
        afterMessageId: randomUUID(),
        requestId: randomUUID()
    }
    const context: XpertResolvedViewHostContext = {
        hostType: 'agent',
        hostId: 'assistant',
        userId: 'user',
        tenantId: 'tenant',
        organizationId: 'org',
        slots: []
    }
    const assertAccess = jest.fn().mockResolvedValue({ id: conversationId, xpertId: 'assistant' })
    const resolve = jest
        .fn()
        .mockResolvedValue({ conversationId: target.id, threadId: target.threadId, xpertId: 'assistant' })

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [TestDatabaseModule, DiscoveryModule, CqrsModule, ConversationBranchModule, ConversationMapModule],
            providers: [ConversationBranchController]
        })
            .overrideModule(ChatConversationModule)
            .useModule(
                boundary([
                    { provide: ChatConversationService, useValue: { assertAccess } },
                    {
                        provide: ChatConversationThreadService,
                        useValue: { requireByThreadId: jest.fn().mockResolvedValue({ conversationId }) }
                    },
                    { provide: WorkbenchAssistantConversationNavigationService, useValue: { resolve } }
                ])
            )
            .overrideModule(ChatMessageModule)
            .useModule(boundary([{ provide: ChatMessageService, useValue: {} }]))
            .overrideModule(CopilotCheckpointModule)
            .useModule(boundary([{ provide: CopilotCheckpointSaver, useValue: {} }]))
            .overrideModule(FileUnderstandingModule)
            .useModule(boundary([{ provide: FileAssetAccessService, useValue: {} }]))
            .overrideModule(XpertModule)
            .useModule(
                boundary([
                    {
                        provide: PublishedXpertAccessService,
                        useValue: { getAccessiblePublishedXpertFamilyIds: jest.fn().mockResolvedValue(['assistant']) }
                    }
                ])
            )
            .overrideModule(XpertProjectModule)
            .useModule(boundary([{ provide: XpertProjectService, useValue: {} }]))
            .overrideModule(XpertProjectAccessModule)
            .useModule(boundary([{ provide: XpertProjectAccessService, useValue: {} }]))
            .compile()
        await module.init()
    })
    afterAll(async () => {
        await module?.close()
    })
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.clearAllMocks()
    })
    afterEach(() => jest.restoreAllMocks())

    it('registers the View and branch handler once without bootstrapping the AI HTTP module', () => {
        const providers = module.get(DiscoveryService).getProviders()
        for (const type of [
            ConversationMapViewProvider,
            ConversationMapService,
            ConversationBranchService,
            ConversationBranchHandler
        ]) {
            expect(providers.filter(({ metatype }) => metatype === type)).toHaveLength(1)
            expect(module.get(type)).toBeInstanceOf(type)
        }
        expect(module.get(ConversationMapViewProvider).getViewManifests(context, AGENT_WORKBENCH_SLOT)).toEqual([
            expect.objectContaining({ key: 'topics', source: { provider: 'platform.conversation-map' } })
        ])
    })

    it('keeps platform composition separate from the core conversation module and AI controllers', () => {
        const rootImports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, ServerAIModule)
        expect(rootImports).toEqual(expect.arrayContaining([ConversationBranchModule, ConversationMapModule]))
        const aiProviders: unknown[] = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AIModule)
        for (const provider of [ConversationMapService, ConversationMapViewProvider, ConversationBranchService]) {
            expect(aiProviders).not.toContain(provider)
        }
        const controllers: unknown[] = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AIModule)
        expect(controllers).toContain(ConversationBranchController)
        for (const type of [ChatConversationModule, ConversationBranchModule, ConversationMapModule]) {
            const imports: unknown[] = Reflect.getMetadata(MODULE_METADATA.IMPORTS, type)
            const resolved = imports.map((entry) =>
                entry && typeof entry === 'object' && 'forwardRef' in entry && typeof entry.forwardRef === 'function'
                    ? entry.forwardRef()
                    : entry
            )
            expect(resolved).not.toContain(undefined)
            expect(resolved).not.toContain(AIModule)
            expect(resolved).not.toContain(ConversationMapModule)
            expect(resolved).not.toContain(ConversationBranchModule)
        }
    })

    it('dispatches the chat endpoint through the registered handler and retains the response DTO', async () => {
        const branch = jest.spyOn(module.get(ConversationBranchService), 'branch').mockResolvedValue(target)
        const result = await module.get(ConversationBranchController).branch(conversationId, input)
        expect(result).toBeInstanceOf(ConversationDTO)
        expect(result).toMatchObject({ id: target.id, threadId: target.threadId })
        expect(branch).toHaveBeenCalledWith(conversationId, input)
        expect(branch).toHaveBeenCalledTimes(1)
    })

    it('dispatches the authorized View action through the same handler with its retry key intact', async () => {
        const branch = jest.spyOn(module.get(ConversationBranchService), 'branch').mockResolvedValue(target)
        const result = await module.get(ConversationMapViewProvider).executeViewAction(context, 'topics', 'act', {
            input: {
                type: 'branch',
                conversationId,
                threadId: input.sourceThreadId,
                messageId: input.afterMessageId,
                requestId: input.requestId
            }
        })
        expect(assertAccess).toHaveBeenCalledWith(conversationId, 'contribute')
        expect(branch).toHaveBeenCalledWith(conversationId, input)
        expect(branch).toHaveBeenCalledTimes(1)
        expect(resolve).toHaveBeenCalledWith(target.id, 'assistant', {
            threadId: target.threadId,
            messageId: undefined
        })
        expect(result).toMatchObject({ success: true, data: { conversationId: target.id, preserveView: true } })
    })

    it('preserves branch authorization failures through the command bus', async () => {
        const denied = new ForbiddenException()
        jest.spyOn(module.get(ConversationBranchService), 'branch').mockRejectedValue(denied)
        await expect(module.get(ConversationBranchController).branch(conversationId, input)).rejects.toBe(denied)
    })
})
