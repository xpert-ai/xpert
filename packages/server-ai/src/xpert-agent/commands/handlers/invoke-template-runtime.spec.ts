jest.mock('../../../chat-conversation/message-checkpoint.service', () => ({
    MessageCheckpointService: class {}
}))

jest.mock('../../../chat-conversation/thread-run-control.service', () => ({
    ThreadRunControlService: class {},
    threadGraphRevision: () => 'graph-v1',
    threadControlConflict: (_key: string, message: string) =>
        new (jest.requireActual('@nestjs/common').ConflictException)(message)
}))

jest.mock('isolated-vm', () => ({
    ExternalCopy: class ExternalCopy {},
    Isolate: class Isolate {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn()
    }
}))

jest.mock('../../../copilot-checkpoint', () => ({
    CopilotCheckpointSaver: class CopilotCheckpointSaver {},
    GetCopilotCheckpointsByParentQuery: class GetCopilotCheckpointsByParentQuery {
        constructor(...args: unknown[]) {
            Object.assign(this, { args })
        }
    }
}))

jest.mock('../../agent', () => ({
    createMapStreamEvents: jest.fn(() => (event: unknown) => event)
}))

jest.mock('../../../environment', () => {
    const actual = jest.requireActual('../../../environment/utils')

    return {
        EnvironmentService: class EnvironmentService {},
        getContextEnvState: actual.getContextEnvState,
        mergeEnvironmentWithEnvState: actual.mergeEnvironmentWithEnvState,
        mergeRuntimeContextWithEnv: actual.mergeRuntimeContextWithEnv
    }
})

jest.mock('../../../shared', () => ({
    getWorkspace: jest.fn(),
    isPlanModeEnabledFromState: (state: { human?: { planMode?: boolean } }) => state?.human?.planMode === true,
    XpertWorkAreaResolver: class XpertWorkAreaResolver {},
    VolumeClient: class VolumeClient {
        static getWorkspacePath = jest.fn()
        static getWorkspaceUrl = jest.fn()
        static getSharedWorkspacePath = jest.fn()
        static getSharedWorkspaceUrl = jest.fn()
        static getXpertWorkspacePath = jest.fn()
        static getXpertWorkspaceUrl = jest.fn()

        getVolumePath(workspace?: string) {
            return workspace ? `/volume/${workspace}` : '/volume'
        }
    },
    ExecutionCancelService: class ExecutionCancelService {}
}))

jest.mock('../../../chat-message/chat-message.entity', () => ({
    ChatMessage: class ChatMessage {}
}))

jest.mock('../../../knowledgebase', () => ({
    KnowledgebaseTaskService: class KnowledgebaseTaskService {},
    KnowledgeTaskServiceQuery: class KnowledgeTaskServiceQuery {}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    RequestContext: jest.requireMock('@xpert-ai/server-core').RequestContext
}))
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { Subscriber } from 'rxjs'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { ExecutionCancelService, XpertWorkAreaResolver } from '../../../shared'
import { AssertAssistantTemplateDependenciesCommand } from '../../../plugin-resource/template-installation/template-readiness.command'
import { InitializeAssistantTemplateFilesCommand } from '../../../xpert/assistant-files/initialize-assistant-template-files.command'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, type TXpertOptions } from '@xpert-ai/contracts'

import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { EnvironmentService } from '../../../environment'
import { ChatMessage } from '../../../chat-message/chat-message.entity'

describe('Assistant template runtime gate', () => {
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let checkpointSaver: { getCopilotCheckpoint: jest.Mock }
    let envService: { findOne: jest.Mock }
    let i18nService: { t: jest.Mock }
    let executionCancelService: { register: jest.Mock; unregister: jest.Mock }
    let chatMessageRepository: { find: jest.Mock; save: jest.Mock }
    let workAreaResolver: { resolve: jest.Mock }
    let module: TestingModule
    let handler: XpertAgentInvokeHandler

    beforeEach(async () => {
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }
        checkpointSaver = {
            getCopilotCheckpoint: jest.fn().mockResolvedValue({
                checkpoint: null,
                pendingWrites: []
            })
        }
        envService = {
            findOne: jest.fn()
        }
        i18nService = {
            t: jest.fn()
        }
        executionCancelService = {
            register: jest.fn(),
            unregister: jest.fn()
        }
        workAreaResolver = {
            resolve: jest.fn()
        }
        chatMessageRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockResolvedValue(undefined)
        }

        module = await Test.createTestingModule({
            providers: [
                XpertAgentInvokeHandler,
                { provide: CommandBus, useValue: commandBus },
                { provide: QueryBus, useValue: queryBus },
                { provide: CopilotCheckpointSaver, useValue: checkpointSaver },
                { provide: EnvironmentService, useValue: envService },
                { provide: I18nService, useValue: i18nService },
                { provide: ExecutionCancelService, useValue: executionCancelService },
                { provide: XpertWorkAreaResolver, useValue: workAreaResolver },
                { provide: getRepositoryToken(ChatMessage), useValue: chatMessageRepository }
            ]
        }).compile()
        handler = module.get(XpertAgentInvokeHandler)
        ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
        ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        ;(RequestContext.currentUser as jest.Mock).mockReturnValue({
            id: 'user-1',
            email: 'user@example.com',
            timeZone: 'Asia/Shanghai',
            preferredLanguage: 'en-US'
        })
    })

    afterEach(async () => {
        await module.close()
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it.each(['v1', 'v2'] as const)(
        'blocks unavailable %s dependencies before resolving a sandbox or compiling a graph',
        async (version) => {
            const locks = [{ pluginName: '@test/skill', version: '1', components: [] }]
            const templateOptions: TXpertOptions =
                version === 'v2'
                    ? { templateDependencyLocks: locks }
                    : { templateSource: { templateId: 'legacy', templateKey: 'legacy', dependencyLocks: locks } }
            const blocked = new Error('dependency changed')
            commandBus.execute.mockImplementation(async (command) => {
                if (command instanceof AssertAssistantTemplateDependenciesCommand) throw blocked
                throw new Error('Unexpected command before dependency validation')
            })
            await expect(
                handler.execute(
                    new XpertAgentInvokeCommand(
                        {},
                        'primary',
                        { id: 'assistant', options: templateOptions },
                        {
                            isDraft: false,
                            rootExecutionId: 'execution',
                            execution: null,
                            subscriber: new Subscriber<MessageEvent>(),
                            store: null
                        }
                    )
                )
            ).rejects.toBe(blocked)
            expect(workAreaResolver.resolve).not.toHaveBeenCalled()
            expect(commandBus.execute).toHaveBeenCalledWith(
                new AssertAssistantTemplateDependenciesCommand('assistant', 'runtime')
            )
        }
    )

    it.each(['v1', 'v2'] as const)(
        'continues %s execution after an advisory without changing the published graph',
        async (version) => {
            const locks = [{ pluginName: '@xpert-ai/plugin-bid', version: '0.6.62', components: [] }]
            const options: TXpertOptions = {
                ...(version === 'v2'
                    ? { templateDependencyLocks: locks }
                    : { templateSource: { templateId: 'legacy', templateKey: 'legacy', dependencyLocks: locks } }),
                templateDefinition: {
                    schemaVersion: 2,
                    manifest: { schemaVersion: 2, version: '1', files: { scope: 'user', entries: [] } }
                }
            }
            const before = structuredClone(options)
            const reached = new Error('continued to file initialization')
            commandBus.execute.mockImplementation(async (command) => {
                if (command instanceof AssertAssistantTemplateDependenciesCommand)
                    return {
                        updates: [
                            {
                                pluginName: '@xpert-ai/plugin-bid',
                                installedVersion: '0.6.62',
                                currentVersion: '0.6.63',
                                changedComponents: []
                            }
                        ]
                    }
                if (command instanceof InitializeAssistantTemplateFilesCommand) throw reached
                throw new Error('Unexpected command')
            })
            const next = jest.fn()
            const subscriber = new Subscriber<MessageEvent>({ next, error: jest.fn(), complete: jest.fn() })
            await expect(
                handler.execute(
                    new XpertAgentInvokeCommand(
                        {},
                        'primary',
                        { id: 'assistant', options },
                        {
                            isDraft: false,
                            rootExecutionId: 'execution',
                            execution: null,
                            subscriber,
                            store: null
                        }
                    )
                )
            ).rejects.toBe(reached)
            expect(next).toHaveBeenCalledTimes(1)
            expect(next).toHaveBeenCalledWith({
                data: {
                    type: ChatMessageTypeEnum.EVENT,
                    event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                    data: expect.objectContaining({
                        type: 'assistant_dependency_update',
                        id: 'assistant-dependency:assistant:@xpert-ai/plugin-bid'
                    })
                }
            })
            expect(options).toEqual(before)
            expect(commandBus.execute).toHaveBeenLastCalledWith(
                new InitializeAssistantTemplateFilesCommand('assistant', 'runtime')
            )
        }
    )

    it('initializes v2 files before creating the user sandbox', async () => {
        const initialized = new Error('initialization reached')
        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof InitializeAssistantTemplateFilesCommand) throw initialized
            throw new Error('Unexpected command before initialization')
        })
        await expect(
            handler.execute(
                new XpertAgentInvokeCommand(
                    {},
                    'primary',
                    {
                        id: 'assistant',
                        options: {
                            templateDefinition: {
                                schemaVersion: 2,
                                manifest: { schemaVersion: 2, version: '1', files: { scope: 'user', entries: [] } }
                            }
                        }
                    },
                    {
                        isDraft: false,
                        rootExecutionId: 'execution',
                        execution: null,
                        subscriber: new Subscriber<MessageEvent>(),
                        store: null
                    }
                )
            )
        ).rejects.toBe(initialized)
        expect(workAreaResolver.resolve).not.toHaveBeenCalled()
        expect(commandBus.execute).toHaveBeenCalledWith(
            new InitializeAssistantTemplateFilesCommand('assistant', 'runtime')
        )
    })
})
