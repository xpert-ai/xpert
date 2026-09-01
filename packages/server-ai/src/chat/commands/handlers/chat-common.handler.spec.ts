jest.mock('../../../chat-conversation', () => ({
    ChatConversationUpsertCommand: class ChatConversationUpsertCommand {
        constructor(
            public readonly entity: object,
            public readonly relations?: string[]
        ) {}
    },
    GetChatConversationQuery: class GetChatConversationQuery {
        constructor(
            public readonly conditions: object,
            public readonly relations?: string[]
        ) {}
    }
}))
jest.mock('../../../chat-message', () => ({
    appendMessageSteps: jest.fn(),
    ChatMessageUpsertCommand: class ChatMessageUpsertCommand {
        constructor(
            public readonly entity: { role?: string; attachments?: unknown[]; fileAssets?: Array<{ id: string }> }
        ) {}
    },
    sanitizeMessageContentForPersistence: (value: unknown) => value
}))
jest.mock('../../../copilot', () => ({ CopilotGetChatQuery: class CopilotGetChatQuery {} }))
jest.mock('../../../copilot-checkpoint', () => ({ CopilotCheckpointSaver: class CopilotCheckpointSaver {} }))
jest.mock('../../../copilot-model', () => ({ CopilotModelGetChatModelQuery: class CopilotModelGetChatModelQuery {} }))
jest.mock('../../../xpert-agent', () => ({
    CompileGraphCommand: class CompileGraphCommand {},
    CompleteToolCallsQuery: class CompleteToolCallsQuery {},
    createMapStreamEvents: jest.fn(),
    messageEvent: jest.fn()
}))
jest.mock('../../../xpert-agent-execution', () => ({
    assignExecutionUsage: jest.fn(),
    XpertAgentExecutionOneQuery: class XpertAgentExecutionOneQuery {},
    XpertAgentExecutionUpsertCommand: class XpertAgentExecutionUpsertCommand {
        constructor(public readonly execution: object) {}
    }
}))
jest.mock('../../../xpert-project/', () => ({
    CreateProjectToolsetCommand: class CreateProjectToolsetCommand {},
    XpertProjectService: class XpertProjectService {}
}))
jest.mock('../../../xpert-project/tools', () => ({ ProjectToolset: class ProjectToolset {} }))
jest.mock('../../../xpert-toolset', () => ({
    ToolsetGetToolsCommand: class ToolsetGetToolsCommand {}
}))
jest.mock('../../../shared', () => ({
    CONFIG_KEY_CREDENTIALS: 'credentials',
    AgentStateAnnotation: { spec: {} },
    ConversationTitleService: class ConversationTitleService {},
    VOLUME_CLIENT: Symbol('VOLUME_CLIENT'),
    collectPendingFollowUpsByClientMessageId: jest.fn().mockReturnValue(null),
    createFollowUpConsumedEvent: jest.fn(),
    createHandoffBackMessages: jest.fn(),
    createHandoffTool: jest.fn(),
    createHumanMessage: jest.fn(),
    createMapStreamEvents: jest.fn(),
    createMemoryStoreCommand: jest.fn(),
    createMessageAppendContextTracker: () => ({ resolve: () => ({ messageContext: undefined }) }),
    hydrateHumanInput: (input: unknown) => input,
    hydrateSendRequestHumanInput: (request: unknown) => request,
    normalizeReferences: (references: unknown) => (Array.isArray(references) ? references : []),
    rejectGraph: jest.fn(),
    stateToParameters: jest.fn(),
    stateVariable: jest.fn(),
    stringifyMessageContent: (value: unknown) => String(value ?? ''),
    translate: (value: unknown) => value,
    updateToolCalls: jest.fn()
}))
jest.mock('../../../xpert/commands/handlers/chat-file-assets', () => ({
    attachChatFileAssetsToConversation: jest.fn(),
    getChatMessageFiles: (message: { fileAssets?: unknown[]; attachments?: unknown[] }) => [
        ...(message.fileAssets ?? []),
        ...(message.attachments ?? [])
    ],
    normalizeChatHumanInputFiles: jest.fn(),
    toChatFileAssetReferences: jest.fn((files: unknown[]) => files.map(() => ({ id: 'file-asset-1' }))),
    toLegacyChatStorageFileAttachments: jest.fn(() => [])
}))

import type { IUser, TChatRequest } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChatConversationUpsertCommand, GetChatConversationQuery } from '../../../chat-conversation'
import { ChatMessageUpsertCommand } from '../../../chat-message'
import {
    attachChatFileAssetsToConversation,
    normalizeChatHumanInputFiles
} from '../../../xpert/commands/handlers/chat-file-assets'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommonHandler } from './chat-common.handler'

describe('ChatCommonHandler Project FileAsset persistence', () => {
    const user = { id: 'user-1', tenantId: 'tenant-1', preferredLanguage: 'en-US' } as IUser
    const conversation = {
        id: 'conversation-1',
        threadId: 'thread-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        createdById: 'user-1',
        projectId: 'project-1',
        messages: [],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
    }
    const normalizedFile = {
        id: 'file-asset-1',
        fileId: 'file-asset-1',
        fileAssetId: 'file-asset-1',
        storageFileId: 'storage-file-1'
    }
    let commandExecute: jest.Mock
    let queryExecute: jest.Mock
    let handler: ChatCommonHandler

    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(normalizeChatHumanInputFiles).mockImplementation(async (input) => ({
            input: input ? { ...input, files: [normalizedFile] } : input,
            changed: true
        }))
        commandExecute = jest.fn(async (command) => {
            if (command instanceof ChatConversationUpsertCommand) return conversation
            if (command instanceof ChatMessageUpsertCommand) return { id: 'message-1', ...command.entity }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                return { id: 'execution-1', threadId: conversation.threadId, ...command.execution }
            }
            return {}
        })
        queryExecute = jest.fn(async (query) => {
            if (query instanceof GetChatConversationQuery) return conversation
            throw new Error(`Unexpected query: ${query?.constructor?.name}`)
        })
        handler = new ChatCommonHandler(
            {} as never,
            { findOne: jest.fn().mockResolvedValue(null) } as never,
            { execute: commandExecute } as unknown as CommandBus,
            { execute: queryExecute } as unknown as QueryBus,
            {} as never,
            {
                resolve: jest.fn(() => ({
                    ensureRoot: jest.fn().mockResolvedValue({
                        serverRoot: '/workspace/project/project-1',
                        publicBaseUrl: undefined
                    })
                }))
            } as never
        )
    })

    it.each(['send', 'follow_up'] as const)('normalizes, persists, and links Project files for %s', async (action) => {
        await handler.execute(commandFor(action))

        expect(normalizeChatHumanInputFiles).toHaveBeenCalledWith(
            expect.objectContaining({ files: expect.any(Array) }),
            expect.objectContaining({
                context: expect.objectContaining({ conversationId: 'conversation-1', projectId: 'project-1' })
            })
        )
        const humanMessage = messageCommands().find((command) => command.entity.role === 'human')
        expect(humanMessage?.entity.fileAssets).toEqual([{ id: 'file-asset-1' }])
        expect(humanMessage?.entity.attachments).toBeUndefined()
        expect(attachChatFileAssetsToConversation).toHaveBeenCalledWith(
            expect.anything(),
            conversation,
            [normalizedFile],
            { projectId: 'project-1' }
        )
    })

    it('does not persist a Project message when central file authorization rejects it', async () => {
        jest.mocked(normalizeChatHumanInputFiles).mockRejectedValueOnce(new ForbiddenException())

        await expect(handler.execute(commandFor('follow_up'))).rejects.toBeInstanceOf(ForbiddenException)

        expect(messageCommands()).toHaveLength(0)
        expect(attachChatFileAssetsToConversation).not.toHaveBeenCalled()
    })

    function commandFor(action: 'send' | 'follow_up') {
        const input = {
            input: 'Review this file',
            files: [{ fileAssetId: 'file-asset-1', storageFileId: 'storage-file-1' }]
        }
        const request: TChatRequest =
            action === 'send'
                ? { action, projectId: 'project-1', message: { input } }
                : { action, conversationId: conversation.id, mode: 'queue', message: { input } }
        return new ChatCommonCommand(request, {
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            user
        })
    }

    function messageCommands() {
        return commandExecute.mock.calls
            .map(([command]) => command)
            .filter((command): command is ChatMessageUpsertCommand => command instanceof ChatMessageUpsertCommand)
    }
})
