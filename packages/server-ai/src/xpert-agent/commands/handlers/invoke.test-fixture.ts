jest.mock('../../../execution-control/execution-cancel.service', () => ({ ExecutionCancelService: class {} }))
jest.mock('../../../execution-control/execution-control.store', () => ({ ExecutionControlStore: class {} }))
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

jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    RequestContext: {
        currentTenantId: jest.fn(),
        getOrganizationId: jest.fn(),
        currentUserId: jest.fn(),
        currentUser: jest.fn()
    }
}))

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: jest.requireMock('@xpert-ai/plugin-sdk').RequestContext
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
    }
}))

jest.mock('../../../chat-message/chat-message.entity', () => ({
    ChatMessage: class ChatMessage {}
}))

jest.mock('../../../knowledgebase', () => ({
    KnowledgebaseTaskService: class KnowledgebaseTaskService {},
    KnowledgeTaskServiceQuery: class KnowledgeTaskServiceQuery {}
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { I18nService } from 'nestjs-i18n'
import { Observable } from 'rxjs'
import { XpertAgentInvokeHandler } from './invoke.handler'
import { XpertWorkAreaResolver } from '../../../shared'
import { ExecutionCancelService } from '../../../execution-control/execution-cancel.service'
import { ExecutionControlStore } from '../../../execution-control/execution-control.store'
import type { ThreadRunControlService } from '../../../chat-conversation/thread-run-control.service'

export function createInvokeHarness() {
    const commandBus = {
        execute: jest.fn()
    }
    const queryBus = {
        execute: jest.fn()
    }
    const checkpointSaver = {
        getCopilotCheckpoint: jest.fn().mockResolvedValue({
            checkpoint: null,
            pendingWrites: []
        })
    }
    const envService = {
        findOne: jest.fn()
    }
    const i18nService = {
        t: jest.fn()
    }
    const executionCancelService = {
        register: jest.fn(),
        check: jest.fn(),
        unregister: jest.fn()
    }
    const workAreaResolver = {
        resolve: jest.fn((input) => createTestWorkArea(input))
    }
    const chatMessageRepository = {
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockResolvedValue(undefined)
    }

    const createHandler = (control?: ThreadRunControlService) =>
        new XpertAgentInvokeHandler(
            commandBus as never,
            queryBus as never,
            checkpointSaver as never,
            envService as never,
            i18nService as unknown as I18nService,
            executionCancelService as unknown as ExecutionCancelService,
            Object.assign(Object.create(ExecutionControlStore.prototype) as ExecutionControlStore, {
                tasks: { execution: jest.fn().mockResolvedValue(null) }
            }),
            workAreaResolver as unknown as XpertWorkAreaResolver,
            undefined,
            chatMessageRepository as never,
            control
        )
    ;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
    ;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
    ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
    ;(RequestContext.currentUser as jest.Mock).mockReturnValue({
        id: 'user-1',
        email: 'user@example.com',
        timeZone: 'Asia/Shanghai',
        preferredLanguage: 'en-US'
    } as never)

    return {
        commandBus,
        queryBus,
        checkpointSaver,
        envService,
        i18nService,
        executionCancelService,
        workAreaResolver,
        chatMessageRepository,
        handler: createHandler(),
        createHandler
    }
}

export function createGraph(streamEvents?: AsyncGenerator<unknown>) {
    return {
        streamEvents: jest.fn().mockReturnValue(
            streamEvents ??
                (async function* () {
                    //
                })()
        ),
        getState: jest.fn().mockResolvedValue({
            config: {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: '',
                    checkpoint_id: 'checkpoint-new'
                }
            },
            parentConfig: {
                configurable: {
                    thread_id: 'thread-1',
                    checkpoint_ns: ''
                }
            },
            values: {},
            tasks: []
        }),
        updateState: jest.fn().mockResolvedValue(undefined)
    }
}

export function createCompiledGraph(graph: ReturnType<typeof createGraph>) {
    return {
        graph,
        agent: {
            key: 'agent-1',
            team: {
                id: 'team-1',
                agentConfig: {}
            }
        },
        xpertGraph: {
            nodes: []
        }
    }
}

export function createTestWorkArea(input: {
    tenantId: string
    userId: string
    provider?: string | null
    xpertId?: string | null
    projectId?: string | null
    conversationId?: string | null
    environmentId?: string | null
}) {
    const workspacePath = '/tmp/xpert-workspace'
    const workspaceUrl = '/xpert-workspace'
    const volumeScope = input.environmentId
        ? {
              tenantId: input.tenantId,
              catalog: 'environment',
              environmentId: input.environmentId,
              userId: input.userId
          }
        : input.projectId
          ? {
                tenantId: input.tenantId,
                catalog: 'projects',
                projectId: input.projectId,
                userId: input.userId
            }
          : {
                tenantId: input.tenantId,
                catalog: 'xperts',
                xpertId: input.xpertId,
                userId: input.userId,
                isolateByUser: false
            }

    return {
        volumeScope,
        workspaceBinding: {
            volumeRoot: '/tmp/xpert-workspace',
            workspaceRoot: '/tmp/xpert-workspace',
            workspacePath
        },
        workingDirectory: workspacePath,
        volumePath: '/tmp/xpert-workspace',
        workspaceRoot: '/tmp/xpert-workspace',
        workspaceUrl,
        sharedPath: input.environmentId
            ? undefined
            : {
                  serverPath: '/tmp/xpert-workspace/shared',
                  workspacePath: '/tmp/xpert-workspace/shared',
                  publicUrl: '/xpert-workspace/shared'
              },
        agentPath:
            input.projectId && input.xpertId
                ? {
                      serverPath: `/tmp/xpert-workspace/agents/${input.xpertId}`,
                      workspacePath: `/tmp/xpert-workspace/agents/${input.xpertId}`,
                      publicUrl: `/xpert-workspace/agents/${input.xpertId}`
                  }
                : undefined,
        sessionPath:
            input.projectId && input.conversationId
                ? {
                      serverPath: `/tmp/xpert-workspace/sessions/${input.conversationId}`,
                      workspacePath: `/tmp/xpert-workspace/sessions/${input.conversationId}`,
                      publicUrl: `/xpert-workspace/sessions/${input.conversationId}`
                  }
                : undefined,
        memoryPath:
            !input.environmentId && !input.projectId
                ? {
                      serverPath: '/tmp/xpert-workspace/.xpert/memory',
                      workspacePath: '/tmp/xpert-workspace/.xpert/memory',
                      publicUrl: '/xpert-workspace/.xpert/memory'
                  }
                : undefined
    }
}

export async function consumeStream(stream: Observable<unknown>) {
    await new Promise<void>((resolve, reject) => {
        stream.subscribe({
            error: reject,
            complete: () => resolve()
        })
    })
}
