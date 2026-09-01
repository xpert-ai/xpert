import type { IUser, TChatOptions, TChatRequest } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { of } from 'rxjs'
import { GetChatConversationQuery } from '../../../chat-conversation/queries/conversation-get.query'
import { PublishedXpertAccessService, XpertChatCommand } from '../../../xpert'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommand } from '../chat.command'
import { ChatCommandHandler } from './chat.handler'

describe('ChatCommandHandler', () => {
    const request: TChatRequest = {
        action: 'retry',
        conversationId: 'conversation-1',
        source: {}
    }
    const user: IUser = { id: 'user-1', tenantId: 'tenant-1' }
    let execute: jest.Mock
    let query: jest.Mock
    let getAccessiblePublishedXpertFamilyIds: jest.Mock
    let handler: ChatCommandHandler

    beforeEach(() => {
        execute = jest.fn().mockReturnValue(of(new MessageEvent('message')))
        query = jest.fn()
        getAccessiblePublishedXpertFamilyIds = jest.fn(async (id: string) => [id])
        handler = new ChatCommandHandler(
            { execute } as unknown as CommandBus,
            { execute: query } as unknown as QueryBus,
            { getAccessiblePublishedXpertFamilyIds } as unknown as PublishedXpertAccessService
        )
    })

    function command(options: Partial<TChatOptions> = {}) {
        return new ChatCommand(request, {
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            user,
            ...options
        })
    }

    function newConversationCommand(options: Partial<TChatOptions> = {}) {
        return new ChatCommand(
            {
                action: 'send',
                message: { input: { input: 'Hello' } }
            },
            {
                ...command().options,
                ...options
            }
        )
    }

    it('routes a Project conversation through its selected Xpert', async () => {
        await handler.execute(newConversationCommand({ projectId: 'project-1', xpertId: 'xpert-1' }))

        expect(execute).toHaveBeenCalledWith(expect.any(XpertChatCommand))
        expect(execute).not.toHaveBeenCalledWith(expect.any(ChatCommonCommand))
    })

    it('rejects a Project conversation without an explicit Xpert', async () => {
        await expect(handler.execute(newConversationCommand({ projectId: 'project-1' }))).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(execute).not.toHaveBeenCalled()
    })

    it('keeps ordinary chat on the common path when no Xpert is selected', async () => {
        await handler.execute(newConversationCommand())

        expect(execute).toHaveBeenCalledWith(expect.any(ChatCommonCommand))
    })

    it('restores the persisted Project and Xpert before routing an existing conversation', async () => {
        query.mockResolvedValue({
            id: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })

        await handler.execute(command())

        expect(query).toHaveBeenCalledWith(expect.any(GetChatConversationQuery))
        const dispatched = execute.mock.calls[0][0] as XpertChatCommand
        expect(dispatched).toBeInstanceOf(XpertChatCommand)
        expect(dispatched.options).toEqual(expect.objectContaining({ projectId: 'project-1', xpertId: 'xpert-1' }))
    })

    it('fails closed when a persisted Project conversation has no Xpert binding', async () => {
        query.mockResolvedValue({
            id: 'conversation-1',
            projectId: 'project-1',
            xpertId: null
        })

        await expect(handler.execute(command())).rejects.toBeInstanceOf(BadRequestException)
        expect(execute).not.toHaveBeenCalled()
    })

    it.each([
        ['Project', { projectId: 'project-2', xpertId: 'xpert-1' }],
        ['Xpert', { projectId: 'project-1', xpertId: 'xpert-2' }]
    ])('rejects a request whose %s conflicts with the persisted conversation', async (_scope, options) => {
        query.mockResolvedValue({
            id: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-1'
        })

        await expect(handler.execute(command(options))).rejects.toBeInstanceOf(BadRequestException)
        expect(execute).not.toHaveBeenCalled()
    })

    it('accepts an existing conversation created by another published version of the same Xpert', async () => {
        query.mockResolvedValue({
            id: 'conversation-1',
            projectId: 'project-1',
            xpertId: 'xpert-v1'
        })
        getAccessiblePublishedXpertFamilyIds.mockResolvedValue(['xpert-v1', 'xpert-v2'])

        await handler.execute(command({ projectId: 'project-1', xpertId: 'xpert-v2' }))

        expect(getAccessiblePublishedXpertFamilyIds).toHaveBeenCalledWith('xpert-v2')
        const dispatched = execute.mock.calls[0][0] as XpertChatCommand
        expect(dispatched.options.xpertId).toBe('xpert-v2')
    })

    it('rejects another actor before routing an existing common conversation', async () => {
        query.mockResolvedValue({
            id: 'conversation-1',
            createdById: 'user-2',
            projectId: null,
            xpertId: null
        })

        await expect(handler.execute(command())).rejects.toBeInstanceOf(ForbiddenException)
        expect(execute).not.toHaveBeenCalled()
    })
})
