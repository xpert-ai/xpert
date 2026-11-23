import { ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKeyOrClientSecretAuthGuard } from '@xpert-ai/server-core'
import { QueryBus } from '@nestjs/cqrs'
import { DiscoveryModule, Reflector } from '@nestjs/core'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    WidgetActionProvider,
    WidgetActionProviderRegistry,
    StrategyBus,
    RequestContext,
    PLUGIN_METADATA_KEY,
    ORGANIZATION_METADATA_KEY
} from '@xpert-ai/plugin-sdk'
import type { Repository } from 'typeorm'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { MessageWidgets } from '../../chat-message/widgets/message-widgets'
import { stripClientSkillContent } from '../../chat-message/client-skill-usage'
import { MessageWidgetActionsController } from './message-widget-actions.controller'

jest.mock('../../chat-message/chat-message.entity', () => ({ ChatMessage: class ChatMessage {} }))

const action = '@test/dashboard:review.publish'
const message = {
    id: 'reply',
    createdInThreadId: 'thread',
    content: [{ type: 'component', id: 'card', data: { type: 'Widget', widgets: [{ serverActions: [action] }] } }]
}
const fields = { title: 'Report', threadId: 'client supplied' }
const queries = { execute: jest.fn() }
const messages = { findOne: jest.fn() }
const widgets = { resolve: jest.fn() }
const registry = { resolve: jest.fn() }
const handler = { execute: jest.fn() }
const controller = new MessageWidgetActionsController(
    queries as unknown as QueryBus,
    messages as unknown as Repository<ChatMessage>,
    registry as unknown as WidgetActionProviderRegistry,
    widgets as unknown as MessageWidgets
)
const submit = (widget = 'card', name = action) => controller.submit('thread', 'reply', widget, name, fields)

beforeEach(() => {
    jest.resetAllMocks()
    widgets.resolve.mockResolvedValue([{ messageId: 'reply', widget: message.content[0] }])
    queries.execute.mockResolvedValue({ id: 'conversation', threadId: 'thread' })
    messages.findOne.mockResolvedValue(message)
    registry.resolve.mockReturnValue(handler)
    handler.execute.mockResolvedValue({ refresh: 'thread' })
})

it('dispatches the offered action with the route identity and the submitted form', async () => {
    await expect(submit()).resolves.toEqual({ refresh: 'thread' })
    expect(queries.execute).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'contribute', where: { threadId: 'thread' } })
    )
    expect(messages.findOne.mock.calls[0][0].where).toMatchObject({ conversationId: 'conversation', id: 'reply' })
    expect(registry.resolve).toHaveBeenCalledWith(action)
    expect(handler.execute).toHaveBeenCalledWith({ threadId: 'thread', messageId: 'reply', widgetId: 'card', fields })
    expect(widgets.resolve).toHaveBeenCalledWith('thread', ['reply'], expect.any(Boolean))
})

it('rejects client-written action declarations when no server-issued card offers the action', async () => {
    messages.findOne.mockResolvedValue({ ...message, content: stripClientSkillContent(message.content) })
    widgets.resolve.mockResolvedValue([])
    await expect(submit()).rejects.toBeInstanceOf(ConflictException)
    expect(handler.execute).not.toHaveBeenCalled()
})

it('ignores stale stored actions and cards belonging to another message', async () => {
    widgets.resolve.mockResolvedValueOnce([
        { messageId: 'reply', widget: { ...message.content[0], data: { type: 'Widget', widgets: [] } } }
    ])
    await expect(submit()).rejects.toBeInstanceOf(ConflictException)
    widgets.resolve.mockResolvedValueOnce([{ messageId: 'another-reply', widget: message.content[0] }])
    await expect(submit()).rejects.toBeInstanceOf(ConflictException)
    expect(handler.execute).not.toHaveBeenCalled()
})

it('keeps authoritative receipt validation in the handler, including repeated actions after the card is hidden', async () => {
    registry.resolve.mockReturnValue({ ...handler, widgetSource: 'receipt' })
    widgets.resolve.mockResolvedValue([])
    await expect(submit()).resolves.toEqual({ refresh: 'thread' })
    await expect(submit()).resolves.toEqual({ refresh: 'thread' })
    handler.execute.mockRejectedValueOnce(new ConflictException())
    await expect(submit()).rejects.toBeInstanceOf(ConflictException)
    expect(widgets.resolve).not.toHaveBeenCalled()
})

it('checks conversation access before looking up a handler or reading a message', async () => {
    queries.execute.mockRejectedValue(new ForbiddenException())
    await expect(submit()).rejects.toBeInstanceOf(ForbiddenException)
    expect(registry.resolve).not.toHaveBeenCalled()
    expect(messages.findOne).not.toHaveBeenCalled()
})

it('rejects an uninstalled action and ignores a forged card or action', async () => {
    registry.resolve.mockReturnValueOnce(undefined)
    await expect(submit()).rejects.toBeInstanceOf(NotFoundException)
    await expect(submit('another-card')).rejects.toBeInstanceOf(ConflictException)
    await expect(submit('card', '@test/dashboard:review.archive')).rejects.toBeInstanceOf(ConflictException)
    expect(handler.execute).not.toHaveBeenCalled()
})

it('accepts legacy messages only on the original thread and rejects sibling messages', async () => {
    messages.findOne.mockResolvedValueOnce({ ...message, createdInThreadId: null })
    await expect(submit()).resolves.toEqual({ refresh: 'thread' })
    messages.findOne.mockResolvedValueOnce({ ...message, createdInThreadId: 'other' }).mockResolvedValueOnce(null)
    await expect(submit()).rejects.toBeInstanceOf(NotFoundException)
    await expect(submit()).rejects.toBeInstanceOf(NotFoundException)
    expect(handler.execute).toHaveBeenCalledTimes(1)
})

it('accepts an encoded scoped package action and rejects invalid form payloads at the HTTP boundary', async () => {
    let binding = SecretTokenBindingType.ENTERPRISE_XPERT
    class AuthenticatedClientSecretGuard extends ApiKeyOrClientSecretAuthGuard {
        protected override authenticateClientSecret(context: ExecutionContext) {
            const request = context
                .switchToHttp()
                .getRequest<{ user?: { clientSecretBindingType: SecretTokenBindingType } }>()
            request.user = { clientSecretBindingType: binding }
            return true
        }
    }
    const cancelAction = '@test/dashboard:review.cancel'
    const cancel = { execute: jest.fn().mockResolvedValue({}) }
    @WidgetActionProvider('@test/dashboard:review')
    class ReviewActions {
        readonly actions = { publish: handler, cancel }
    }
    Reflect.defineMetadata(PLUGIN_METADATA_KEY, '@test/dashboard', ReviewActions)
    Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, 'org-a', ReviewActions)
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        controllers: [MessageWidgetActionsController],
        providers: [
            StrategyBus,
            WidgetActionProviderRegistry,
            ReviewActions,
            { provide: QueryBus, useValue: queries },
            { provide: getRepositoryToken(ChatMessage), useValue: messages },
            { provide: MessageWidgets, useValue: widgets }
        ]
    })
        .overrideGuard(ApiKeyOrClientSecretAuthGuard)
        .useValue(new AuthenticatedClientSecretGuard(new Reflector(), queries as unknown as QueryBus))
        .compile()
    const app = module.createNestApplication()
    const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-a')
    try {
        await app.listen(0, '127.0.0.1')
        const messageId = '00000000-0000-4000-8000-000000000001'
        widgets.resolve.mockResolvedValue([{ messageId, widget: message.content[0] }])
        const baseUrl = await app.getUrl()
        const url = (name: string) =>
            baseUrl + '/threads/thread/messages/' + messageId + '/widgets/card/actions/' + encodeURIComponent(name)
        const post = (body: unknown, name = action) =>
            fetch(url(name), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-client-secret': 'cs-x-test' },
                body: JSON.stringify(body)
            })
        expect((await post([])).status).toBe(400)
        expect(handler.execute).not.toHaveBeenCalled()
        expect((await post(fields)).status).toBe(200)
        expect(handler.execute).toHaveBeenCalledWith({ threadId: 'thread', messageId, widgetId: 'card', fields })
        expect((await post(fields, cancelAction)).status).toBe(409)
        expect(cancel.execute).not.toHaveBeenCalled()
        widgets.resolve.mockResolvedValue([
            {
                messageId,
                widget: {
                    type: 'component',
                    id: 'card',
                    data: { type: 'Widget', widgets: [{ serverActions: [action, cancelAction] }] }
                }
            }
        ])
        expect((await post(fields, cancelAction)).status).toBe(200)
        expect(cancel.execute).toHaveBeenCalledWith({ threadId: 'thread', messageId, widgetId: 'card', fields })
        binding = SecretTokenBindingType.USER_CONVERSATION
        expect((await post(fields)).status).toBe(403)
        expect(handler.execute).toHaveBeenCalledTimes(1)
        binding = SecretTokenBindingType.PUBLIC_XPERT
        expect((await post(fields)).status).toBe(200)
        expect((await post(fields, '@test/dashboard:review.constructor')).status).toBe(404)
        app.get(StrategyBus).remove('org-a', '@test/dashboard', 'uninstall')
        expect((await post(fields)).status).toBe(404)
        expect((await post(fields, cancelAction)).status).toBe(404)
    } finally {
        org.mockRestore()
        await app.close()
    }
})

it('accepts the current server action of a dynamically restored card', async () => {
    messages.findOne.mockResolvedValue({ ...message, content: 'Choose' })
    widgets.resolve.mockResolvedValue([{ messageId: 'reply', widget: message.content[0] }])
    await expect(submit()).resolves.toEqual({ refresh: 'thread' })
    widgets.resolve.mockResolvedValue([])
    await expect(submit()).rejects.toBeInstanceOf(ConflictException)
    expect(handler.execute).toHaveBeenCalledTimes(1)
})
