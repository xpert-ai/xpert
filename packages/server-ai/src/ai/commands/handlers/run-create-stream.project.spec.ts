jest.mock('../../../desktop-shell/desktop-shell-auth.service', () => ({ DesktopShellAuthService: class {} }))
jest.mock('../../../chat-conversation/conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../../chat-conversation/thread-run-control.service', () => ({ ThreadRunControlService: class {} }))
jest.mock('../../../shared/stream/', () => jest.requireActual('../../../shared/stream/run-stream-payload'))
jest.mock('../../../environment', () => ({
    ...jest.requireActual('../../../environment/utils'),
    EnvironmentService: class {}
}))
jest.mock('../../../xpert', () => ({ PublishedXpertAccessService: class {}, XpertPrincipalService: class {} }))
jest.mock('../../../xpert-project', () => ({ XpertProjectService: class {} }))
jest.mock('../../../xpert-project/services/conversation-project.service', () => ({
    ConversationProjectService: class {}
}))
jest.mock('../../public-xpert-principal', () => ({ assertPublicXpertSessionConversationAccess: jest.fn() }))
jest.mock('../../api-chat-source', () => ({ getTrustedApiChatSource: () => ({}) }))
jest.mock('../../assistant-request-context', () => ({
    applyAssistantScope: jest.fn(),
    resolveAssistantForRequest: jest.fn(),
    bindConversationAssistantIfUnbound: jest.fn((_bus, conversation) => conversation),
    bindConversationProjectIfUnbound: jest.fn((_bus, conversation, projectId) => ({
        ...conversation,
        projectId: conversation.projectId ?? projectId
    }))
}))

import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EMPTY } from 'rxjs'
import { IChatConversation } from '@xpert-ai/contracts'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { EnvironmentService } from '../../../environment'
import { PublishedXpertAccessService, XpertPrincipalService } from '../../../xpert'
import { XpertProjectService } from '../../../xpert-project'
import { ConversationProjectService } from '../../../xpert-project/services/conversation-project.service'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { applyAssistantScope, resolveAssistantForRequest } from '../../assistant-request-context'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { RunCreateStreamHandler } from './run-create-stream.handler'

describe('run first-send Project preparation', () => {
    const xpert = {
        id: 'assistant',
        options: { workspaceScope: { mode: 'project-required', onMissing: 'create' } }
    } as Awaited<ReturnType<typeof resolveAssistantForRequest>>
    let conversation: IChatConversation
    const prepare = jest.fn()
    const selectNone = jest.fn()
    const assertRuntimeAccess = jest.fn()
    const execute = jest.fn()
    let handler: RunCreateStreamHandler
    const command = () =>
        new RunCreateStreamCommand('thread', {
            assistant_id: 'assistant',
            stream_mode: ['messages'],
            stream_subgraphs: true,
            on_disconnect: 'continue',
            multitask_strategy: 'reject',
            if_not_exists: 'reject',
            input: {
                action: 'send',
                message: {
                    clientMessageId: 'user-message',
                    input: {
                        input: 'Create the outline only',
                        files: [{ fileId: 'file-1', originalName: 'tender.pdf' }]
                    }
                }
            }
        })

    beforeEach(async () => {
        jest.clearAllMocks()
        conversation = { id: 'conversation', threadId: 'thread', xpertId: 'assistant' } as IChatConversation
        jest.mocked(resolveAssistantForRequest).mockResolvedValue(xpert)
        prepare.mockImplementation(async () => {
            expect(applyAssistantScope).not.toHaveBeenCalled()
            return { ...conversation, projectId: 'created-project' }
        })
        selectNone.mockImplementation(async (current: IChatConversation) => {
            expect(applyAssistantScope).not.toHaveBeenCalled()
            return { ...current, options: { ...current.options, projectSelection: { mode: 'none' } } }
        })
        assertRuntimeAccess.mockImplementation(async () => {
            expect(applyAssistantScope).not.toHaveBeenCalled()
        })
        execute.mockImplementation(async (cmd) => (cmd instanceof XpertChatCommand ? EMPTY : { id: 'run' }))
        const module = await Test.createTestingModule({
            providers: [
                RunCreateStreamHandler,
                { provide: CommandBus, useValue: { execute } },
                { provide: QueryBus, useValue: { execute: async () => conversation } },
                { provide: EnvironmentService, useValue: {} },
                { provide: PublishedXpertAccessService, useValue: {} },
                { provide: XpertPrincipalService, useValue: {} },
                { provide: XpertProjectService, useValue: { assertRuntimeAccess } },
                { provide: ConversationProjectService, useValue: { prepare, selectNone } }
            ]
        }).compile()
        handler = module.get(RunCreateStreamHandler)
    })

    it('prepares and authorizes before principal switching, preserving the first message and attachment handles', async () => {
        await handler.execute(command())
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(assertRuntimeAccess).toHaveBeenCalledWith('created-project', 'assistant')
        const dispatched = execute.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd instanceof XpertChatCommand)
        expect(dispatched).toMatchObject({
            request: {
                projectId: 'created-project',
                message: { clientMessageId: 'user-message', input: { files: [{ fileId: 'file-1' }] } }
            },
            options: { projectId: 'created-project' }
        })
    })

    it('reuses a persisted Project', async () => {
        conversation.projectId = 'existing'
        await handler.execute(command())
        expect(prepare).not.toHaveBeenCalled()
        expect(assertRuntimeAccess).toHaveBeenCalledWith('existing', 'assistant')
    })

    it('does not create when the caller selected an explicit Project', async () => {
        const request = command()
        request.runCreate.input = {
            action: 'send',
            projectId: 'selected',
            message: { input: { input: 'Outline only' } }
        }
        await handler.execute(request)
        expect(prepare).not.toHaveBeenCalled()
        expect(assertRuntimeAccess).toHaveBeenCalledWith('selected', 'assistant')
    })

    it('preserves project-required rejection for Assistants without the opt-in', async () => {
        jest.mocked(resolveAssistantForRequest).mockResolvedValue({
            ...xpert,
            options: { workspaceScope: { mode: 'project-required' } }
        })
        await expect(handler.execute(command())).rejects.toThrow('requires a Project')
        expect(prepare).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })

    it('creates a fresh Project for explicit auto-new instead of using stale host context', async () => {
        const request = command()
        request.runCreate.input = {
            action: 'send',
            projectId: 'old-project',
            projectSelection: { mode: 'auto-new' },
            message: { input: { input: 'Outline only' } }
        }
        Object.assign(request.runCreate, {
            context: { projectId: 'old-project', env: { projectId: 'old-project', region: 'east' } }
        })
        await handler.execute(request)
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(assertRuntimeAccess).toHaveBeenCalledWith('created-project', 'assistant')
        const dispatched = execute.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd instanceof XpertChatCommand)
        expect(dispatched.options).toMatchObject({ projectId: 'created-project', context: { env: { region: 'east' } } })
        expect(dispatched.options.context).not.toHaveProperty('projectId')
        expect(dispatched.options.context.env).not.toHaveProperty('projectId')
    })

    it('persists explicit no-project and ignores host context on subsequent sends', async () => {
        jest.mocked(resolveAssistantForRequest).mockResolvedValue({
            ...xpert,
            options: { workspaceScope: { mode: 'project-preferred', onMissing: 'create' } }
        })
        const request = command()
        request.runCreate.input = {
            action: 'send',
            projectSelection: { mode: 'none' },
            message: { input: { input: 'Personal task' } }
        }
        Object.assign(request.runCreate, { context: { projectId: 'old-project', env: { projectId: 'old-project' } } })
        await handler.execute(request)
        expect(prepare).not.toHaveBeenCalled()
        expect(assertRuntimeAccess).not.toHaveBeenCalled()
        expect(selectNone).toHaveBeenCalledWith(conversation)
        expect(execute.mock.calls.some(([cmd]) => cmd instanceof ChatConversationUpsertCommand)).toBe(false)
        conversation = await selectNone.mock.results[0].value

        // Reloading a generic Assistant can supply its default again. Saved intent wins.
        const next = command()
        next.runCreate.input = {
            action: 'send',
            projectSelection: { mode: 'auto-new' },
            message: { input: { input: 'Continue' } }
        }
        jest.mocked(applyAssistantScope).mockClear()
        await handler.execute(next)
        expect(prepare).not.toHaveBeenCalled()
        expect(assertRuntimeAccess).not.toHaveBeenCalled()
        const dispatched = execute.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof XpertChatCommand)
        expect(dispatched).toHaveLength(2)
        expect(dispatched[1].request).toMatchObject({ projectSelection: { mode: 'none' } })
        expect(dispatched[1].options.projectId).toBeUndefined()
    })

    it('stops before model execution if a concurrent Project bind beats the no-Project choice', async () => {
        jest.mocked(resolveAssistantForRequest).mockResolvedValue({
            ...xpert,
            options: { workspaceScope: { mode: 'project-preferred', onMissing: 'create' } }
        })
        const request = command()
        request.runCreate.input = {
            action: 'send',
            projectSelection: { mode: 'none' },
            message: { input: { input: 'Personal task' } }
        }
        selectNone.mockRejectedValueOnce(new Error('Project already bound'))
        await expect(handler.execute(request)).rejects.toThrow('Project already bound')
        expect(applyAssistantScope).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })

    it('rejects explicit no-project when the Assistant requires a Project without creating one', async () => {
        const request = command()
        request.runCreate.input = {
            action: 'send',
            projectSelection: { mode: 'none' },
            message: { input: { input: 'Outline only' } }
        }
        await expect(handler.execute(request)).rejects.toThrow('requires a Project')
        expect(prepare).not.toHaveBeenCalled()
        expect(selectNone).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })

    it('preserves explicit selection in legacy ChatKit inputs', async () => {
        const request = command()
        request.runCreate.input = {
            input: { input: 'Outline only' },
            projectId: 'old-project',
            projectSelection: { mode: 'auto-new' }
        }
        await handler.execute(request)
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(assertRuntimeAccess).toHaveBeenCalledWith('created-project', 'assistant')
    })

    it('never starts the model when preparation fails', async () => {
        prepare.mockRejectedValueOnce(new Error('creation denied'))
        await expect(handler.execute(command())).rejects.toThrow('creation denied')
        expect(applyAssistantScope).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })

    it('does not create a workspace while retrying an old personal execution', async () => {
        const request = command()
        request.runCreate.input = { action: 'retry', source: { executionId: 'prior' } }
        await expect(handler.execute(request)).rejects.toThrow()
        expect(prepare).not.toHaveBeenCalled()
    })
})
