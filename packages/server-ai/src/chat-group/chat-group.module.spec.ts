import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { RuntimeResourceService } from '../agent-plugin/runtime-resource.service'
import { XpertProjectFeatureGuard } from '../xpert-project/guards/project-feature.guard'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectWorkspaceFilesService } from '../xpert-project/services/project-workspace-files.service'
import { XpertWorkspaceFilesService } from '../xpert/xpert-workspace-files.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { XpertProjectTypeService } from '../xpert-project/services/project-type.service'
import { AgentPluginModule } from '../agent-plugin/agent-plugin.module'
import { XpertProjectModule } from '../xpert-project/project.module'
import { ApiKeyOrClientSecretAuthGuard, ViewExtensionModule, ViewExtensionService } from '@xpert-ai/server-core'
import { ForbiddenException, Global, INestApplication, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import type { AgentChatDispatchPayload, HandoffMessage } from '@xpert-ai/plugin-sdk'
import type { ChatGroupSnapshot } from '@xpert-ai/contracts'
import { GROUP_CONTROLLERS } from '../ai/groups'
import { GroupWorkbenchGuard } from '../ai/groups/group-workbench.guard'
import { WorkspaceFileAccessModule } from '../workspace-file-access/workspace-file-access.module'
import { WorkspaceFileAccessService } from '../workspace-file-access/workspace-file-access.service'
import { GroupScopeGuard } from '../ai/groups/group-scope.guard'
import { GetRuntimeCapabilitiesHandler } from '../xpert/runtime-capabilities/get-runtime-capabilities.handler'
import { RuntimeCapabilitiesService } from '../xpert/runtime-capabilities/runtime-capabilities.service'
import { ChatConversationModule } from '../chat-conversation/conversation.module'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { HandoffQueueModule } from '../handoff/message-queue.module'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { HandoffOutboxAdapters } from '../handoff/outbox-adapters.service'
import { SseStreamModule } from '../shared/stream'
import { RedisSseStreamService } from '../shared/stream/redis-sse.service'
import { XpertModule } from '../xpert/xpert.module'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertPrincipalService } from '../xpert/xpert-principal.service'
import { ChatGroupModule } from './chat-group.module'
import { GroupComposerService } from './group-composer.service'
import { FinishGroupChatCommand, PrepareGroupChatCommand } from './group-dispatch.commands'
import { GroupMessagesService } from './group-messages.service'
import { GroupMessageProcessor, GroupOutboxService } from './group-outbox.service'
import { GroupRuntimeService } from './group-runtime.service'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'

const id = '11111111-1111-4111-8111-111111111111'
const unregister = jest.fn()
const adapters = { register: jest.fn(() => unregister) }
const published = { getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id, type: 'agent' }) }
const capabilities = {
    getRuntimeCapabilities: jest.fn().mockResolvedValue({ skills: [], plugins: [], subAgents: [], commands: [] })
}

@Global()
@Module({
    providers: [
        {
            provide: DataSource,
            useValue: {
                entityMetadatas: [],
                options: { type: 'postgres' },
                getRepository: () => ({})
            }
        }
    ],
    exports: [DataSource]
})
class DatabaseStubModule {}

@Module({
    imports: [CqrsModule],
    providers: [
        GetRuntimeCapabilitiesHandler,
        { provide: RuntimeCapabilitiesService, useValue: capabilities },
        { provide: PublishedXpertAccessService, useValue: published },
        { provide: XpertPrincipalService, useValue: {} },
        { provide: XpertWorkspaceFilesService, useValue: {} }
    ],
    exports: [PublishedXpertAccessService, XpertPrincipalService, XpertWorkspaceFilesService]
})
class XpertStubModule {}

@Module({
    providers: [{ provide: ThreadRunControlService, useValue: {} }],
    exports: [ThreadRunControlService]
})
class ConversationStubModule {}

@Module({
    providers: [
        { provide: HandoffQueueService, useValue: {} },
        { provide: HandoffOutboxAdapters, useValue: adapters }
    ],
    exports: [HandoffQueueService, HandoffOutboxAdapters]
})
class QueueStubModule {}

@Module({
    providers: [{ provide: RedisSseStreamService, useValue: {} }],
    exports: [RedisSseStreamService]
})
class StreamStubModule {}

// Scoped providers exercise explicit imports/exports; no global service lookup is available.
@Module({
    providers: [{ provide: RuntimeResourceService, useValue: {} }],
    exports: [RuntimeResourceService]
})
class AgentPluginStubModule {}
@Module({
    providers: [
        { provide: XpertProjectService, useValue: {} },
        { provide: XpertProjectTypeService, useValue: {} },
        { provide: XpertProjectAccessService, useValue: {} },
        { provide: XpertProjectFeatureGuard, useValue: {} },
        { provide: XpertProjectWorkspaceFilesService, useValue: {} }
    ],
    exports: [
        XpertProjectService,
        XpertProjectTypeService,
        XpertProjectAccessService,
        XpertProjectFeatureGuard,
        XpertProjectWorkspaceFilesService
    ]
})
class ProjectStubModule {}

@Module({
    providers: [{ provide: XpertWorkspaceAccessService, useValue: {} }],
    exports: [XpertWorkspaceAccessService]
})
class WorkspaceStubModule {}

@Module({
    providers: [{ provide: ViewExtensionService, useValue: {} }],
    exports: [ViewExtensionService]
})
class ViewStubModule {}

@Module({
    providers: [{ provide: WorkspaceFileAccessService, useValue: {} }],
    exports: [WorkspaceFileAccessService]
})
class FileAccessStubModule {}

// Only the infrastructure modules are replaced; group providers and their exports are real.
@Module({
    imports: [
        ChatGroupModule,
        XpertProjectModule,
        ViewExtensionModule,
        WorkspaceFileAccessModule,
        RouterModule.register([{ path: 'ai', module: GroupHttpTestModule }])
    ],
    controllers: GROUP_CONTROLLERS,
    providers: [GroupScopeGuard, GroupWorkbenchGuard]
})
class GroupHttpTestModule {}

describe('ChatGroupModule integration boundary', () => {
    let module: TestingModule
    let app: INestApplication
    let origin: string

    beforeAll(async () => {
        jest.spyOn(GroupScopeGuard.prototype, 'canActivate').mockResolvedValue(true)
        jest.spyOn(ApiKeyOrClientSecretAuthGuard.prototype, 'canActivate').mockResolvedValue(true)
        module = await Test.createTestingModule({ imports: [DatabaseStubModule, GroupHttpTestModule] })
            .overrideModule(ViewExtensionModule)
            .useModule(ViewStubModule)
            .overrideModule(WorkspaceFileAccessModule)
            .useModule(FileAccessStubModule)
            .overrideModule(AgentPluginModule)
            .useModule(AgentPluginStubModule)
            .overrideModule(XpertProjectModule)
            .useModule(ProjectStubModule)
            .overrideModule(XpertWorkspaceModule)
            .useModule(WorkspaceStubModule)
            .overrideModule(XpertModule)
            .useModule(XpertStubModule)
            .overrideModule(ChatConversationModule)
            .useModule(ConversationStubModule)
            .overrideModule(HandoffQueueModule)
            .useModule(QueueStubModule)
            .overrideModule(SseStreamModule)
            .useModule(StreamStubModule)
            .compile()
        app = module.createNestApplication({ logger: false })
        app.setGlobalPrefix('api')
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })

    afterAll(async () => {
        await app?.close()
        expect(unregister).toHaveBeenCalledTimes(1)
        jest.restoreAllMocks()
    })

    it('exports Composer dependencies from their owning production modules', () => {
        expect(Reflect.getMetadata('exports', XpertProjectModule)).toEqual(
            expect.arrayContaining([
                XpertProjectTypeService,
                XpertProjectFeatureGuard,
                XpertProjectWorkspaceFilesService
            ])
        )
        expect(Reflect.getMetadata('exports', XpertWorkspaceModule)).toContain(XpertWorkspaceAccessService)
        expect(Reflect.getMetadata('exports', AgentPluginModule)).toContain(RuntimeResourceService)
        expect(Reflect.getMetadata('exports', XpertModule)).toContain(XpertWorkspaceFilesService)
    })

    it('injects group services into the HTTP adapter through module exports', async () => {
        const messages = module.get(GroupMessagesService)
        const value: ChatGroupSnapshot = {
            id,
            threadId: id,
            title: 'Group',
            viewerParticipantId: id,
            xpertId: id,
            members: [],
            messages: [],
            hasMore: false,
            revision: 0,
            runs: []
        }
        const snapshot = jest.spyOn(messages, 'snapshot').mockResolvedValue(value)
        const response = await fetch(`${origin}/api/ai/groups/${id}?limit=3`)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(value)
        expect(snapshot).toHaveBeenCalledWith(id, undefined, 3)
        expect((await fetch(`${origin}/api/groups/${id}`)).status).toBe(404)
    })

    it('routes resource requests through concrete Composer operations after member checks', async () => {
        const composer = module.get(GroupComposerService)
        const member = jest.spyOn(composer, 'member').mockResolvedValue(Object.assign(new GroupParticipant(), { id }))
        const catalog = jest.spyOn(composer, 'resourceCatalog').mockResolvedValue({ items: [], total: 0 })
        const response = await fetch(
            `${origin}/api/ai/groups/${id}/members/${id}/composer/assistants/${id}/resources?projectId=${id}`
        )
        expect(response.status).toBe(200)
        expect(member).toHaveBeenCalledWith(id, id, id)
        expect(catalog).toHaveBeenCalledWith(id, { projectId: id, offset: 0, limit: 50 })
        member.mockRejectedValueOnce(new ForbiddenException('member denied'))
        catalog.mockClear()
        const denied = await fetch(`${origin}/api/ai/groups/${id}/members/${id}/composer/assistants/${id}/resources`)
        expect(denied.status).toBe(403)
        expect(catalog).not.toHaveBeenCalled()
        member.mockRestore()
        catalog.mockRestore()
    })

    it('registers the group CQRS handlers and dispatches to the module runtime', async () => {
        const runtime = module.get(GroupRuntimeService)
        const prepare = jest.spyOn(runtime, 'prepare').mockResolvedValue(null)
        const finish = jest.spyOn(runtime, 'finish').mockResolvedValue(undefined)
        const job: HandoffMessage<AgentChatDispatchPayload> = {
            id,
            type: 'agent_chat_dispatch',
            version: 1,
            tenantId: id,
            sessionKey: id,
            businessKey: id,
            attempt: 1,
            maxAttempts: 5,
            traceId: id,
            enqueuedAt: Date.now(),
            payload: {
                request: { action: 'send', conversationId: id, message: { input: { input: '' } } },
                options: { xpertId: id, groupDeliveryId: id },
                callback: { messageType: 'test_callback', events: 'lifecycle' }
            }
        }
        const bus = module.get(CommandBus)
        await expect(bus.execute(new PrepareGroupChatCommand(job))).resolves.toBeNull()
        await bus.execute(new FinishGroupChatCommand(id, false, true))
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(prepare).toHaveBeenCalledWith(job)
        expect(finish).toHaveBeenCalledTimes(1)
        expect(finish).toHaveBeenCalledWith(id, false, true)
    })

    it('resolves capabilities through the Xpert CQRS handler without exporting its service', async () => {
        await expect(module.get(GroupComposerService).capabilities(id)).resolves.toEqual({
            skills: [],
            plugins: [],
            subAgents: [],
            commands: []
        })
        expect(capabilities.getRuntimeCapabilities).toHaveBeenCalledTimes(1)
    })

    it('shares one outbox between the queue processor and lifecycle registration', async () => {
        const outbox = module.get(GroupOutboxService)
        const route = jest.spyOn(outbox, 'route').mockResolvedValue({ status: 'ok' })
        const receipt = Object.assign(new GroupMessageRecipient(), {
            id,
            groupId: id,
            participantId: id,
            messageId: id,
            tenantId: id,
            organizationId: id
        })
        const job = outbox.message(receipt)
        await expect(module.get(GroupMessageProcessor).process(job)).resolves.toEqual({ status: 'ok' })
        expect(route).toHaveBeenCalledWith(id, id)
        expect(adapters.register).toHaveBeenCalledTimes(1)
        expect(adapters.register).toHaveBeenCalledWith(outbox)
    })
})
