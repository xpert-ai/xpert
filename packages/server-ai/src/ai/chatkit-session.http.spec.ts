import { init } from 'i18next'
import { ExecutionContext, ForbiddenException, INestApplication } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IApiKey, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, SecretTokenService } from '@xpert-ai/server-core'
import { AIV1Controller } from './ai-v1.controller'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocumentService } from '../knowledge-document'
import { PublishedXpertAccessService } from '../xpert'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { WorkbenchAssistantConversationNavigationService } from '../chat-conversation/workbench-assistant-conversation-navigation.service'
import { GetGroupConversationEntryCommand } from '../chat-group/group-conversation-entry.command'

const conversationId = '11111111-1111-4111-8111-111111111111'
describe('unified ChatKit session HTTP boundary', () => {
    let app: INestApplication
    let origin: string
    const commands = { execute: jest.fn() }
    const tokens = { createHashed: jest.fn() }
    const assistants = { getAccessiblePublishedXpert: jest.fn() }
    beforeAll(async () => {
        await init({
            lng: 'en',
            resources: {
                en: {
                    'server-ai': {
                        Error: {
                            ChatkitSessionInputInvalid: 'Invalid ChatKit session input.'
                        }
                    }
                }
            }
        })
        const module = await Test.createTestingModule({
            controllers: [AIV1Controller],
            providers: [
                { provide: QueryBus, useValue: {} },
                { provide: CommandBus, useValue: commands },
                { provide: KnowledgebaseService, useValue: {} },
                { provide: KnowledgeDocumentService, useValue: {} },
                { provide: SecretTokenService, useValue: tokens },
                { provide: PublishedXpertAccessService, useValue: assistants },
                { provide: XpertProjectAccessService, useValue: {} },
                { provide: WorkbenchAssistantConversationNavigationService, useValue: {} }
            ]
        })
            .overrideGuard(ApiKeyOrClientSecretAuthGuard)
            .useValue({
                canActivate: (context: ExecutionContext) => {
                    // ApiKeyDecorator reads the authenticated request, not RequestContext directly.
                    const request = context.switchToHttp().getRequest<{ user?: { apiKey: IApiKey } }>()
                    const apiKey = RequestContext.currentApiKey()
                    if (apiKey) request.user = { apiKey }
                    return true
                }
            })
            .compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'human-A', tenantId: 'tenant' } as never)
        commands.execute.mockResolvedValue({ id: conversationId, purpose: 'group' })
    })
    afterEach(() => jest.restoreAllMocks())
    afterAll(async () => app?.close())
    const post = (body: unknown) =>
        fetch(`${origin}/v1/chatkit/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
    it.each(['human-A', 'human-B'])(
        'issues a conversation credential for authenticated %s with fixed scope and bounded lifetime',
        async (id) => {
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id, tenantId: 'tenant' } as never)
            const response = await post({ scope: { kind: 'conversation', conversationId }, expires_after: 7200 })
            expect(response.status).toBe(201)
            expect(await response.json()).toMatchObject({
                client_secret: expect.stringMatching(/^cs-x-/),
                expires_after: 3600
            })
            expect(commands.execute).toHaveBeenCalledWith(new GetGroupConversationEntryCommand(conversationId))
            expect(commands.execute.mock.invocationCallOrder[0]).toBeLessThan(
                tokens.createHashed.mock.invocationCallOrder[0]
            )
            expect(tokens.createHashed).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityId: conversationId,
                    type: SecretTokenBindingType.USER_CONVERSATION,
                    createdById: id,
                    tenantId: 'tenant',
                    organizationId: 'org'
                })
            )
        }
    )
    it('preserves the ordinary Assistant form and default lifetime', async () => {
        const response = await post({ assistant: { id: 'assistant-C' } })
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({ expires_after: 600 })
        expect(assistants.getAccessiblePublishedXpert).toHaveBeenCalledWith('assistant-C')
        expect(tokens.createHashed).toHaveBeenCalledWith(
            expect.objectContaining({ type: SecretTokenBindingType.USER_XPERT })
        )
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it.each([
        { scope: { kind: 'group', conversationId } },
        { scope: { kind: 'conversation', conversationId: '../other' } },
        { scope: { kind: 'conversation', conversationId, tenantId: 'forged' } },
        { scope: { kind: 'conversation', conversationId }, organizationId: 'forged' },
        { scope: { kind: 'conversation', conversationId }, user: 'human-B' },
        { scope: { kind: 'conversation', conversationId }, assistant: { id: 'C' } },
        { assistant: { id: 'C', scope: 'all' } },
        { scope: { kind: 'conversation', conversationId }, expires_after: -1 },
        { scope: { kind: 'conversation', conversationId }, expires_after: 1.5 },
        { scope: { kind: 'conversation', conversationId }, project: { id: 'P' } },
        { scope: { kind: 'conversation', conversationId }, conversation: { id: 'D', requesterXpertId: 'C' } }
    ])('rejects malformed or forged scope at the HTTP boundary: %j', async (body) => {
        const response = await post(body)
        expect(response.status).toBe(400)
        expect((await response.json()).message).toBe('Invalid ChatKit session input.')
        expect(tokens.createHashed).not.toHaveBeenCalled()
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it.each([
        SecretTokenBindingType.USER_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.USER_CONVERSATION
    ])('does not exchange a %s credential for a group session', async (binding) => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            id: 'principal',
            principalType: 'client_secret',
            clientSecretBindingType: binding
        } as never)
        expect((await post({ scope: { kind: 'conversation', conversationId } })).status).toBe(403)
        expect(tokens.createHashed).not.toHaveBeenCalled()
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it('preserves API-key-bound sessions without converting them to a human group grant', async () => {
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue({
            id: 'service-key',
            tenantId: 'tenant',
            organizationId: 'org'
        } as never)
        const response = await post({ expires_after: 7200 })
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({ expires_after: 7200 })
        expect(tokens.createHashed).toHaveBeenCalledWith(
            expect.objectContaining({
                type: SecretTokenBindingType.API_KEY,
                entityId: 'service-key',
                tenantId: 'tenant',
                organizationId: 'org'
            })
        )
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it('does not derive a group user from an API-key creator', async () => {
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue({ id: 'service-key', tenantId: 'tenant' } as never)
        expect((await post({ scope: { kind: 'conversation', conversationId } })).status).toBe(403)
        expect(tokens.createHashed).not.toHaveBeenCalled()
        expect(commands.execute).not.toHaveBeenCalled()
    })
    it.each(['currentUser', 'currentTenantId', 'getOrganizationId'] as const)(
        'requires authenticated group context: %s',
        async (field) => {
            jest.spyOn(RequestContext, field).mockReturnValue(null)
            expect((await post({ scope: { kind: 'conversation', conversationId } })).status).toBe(403)
            expect(tokens.createHashed).not.toHaveBeenCalled()
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )
    it('does not issue after group membership authorization fails', async () => {
        commands.execute.mockRejectedValueOnce(new ForbiddenException())
        expect((await post({ scope: { kind: 'conversation', conversationId } })).status).toBe(403)
        expect(tokens.createHashed).not.toHaveBeenCalled()
    })
    it('prevents conversation secrets from minting further sessions even behind an internal caller', async () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION
        } as never)
        expect((await post({ assistant: { id: 'C' } })).status).toBe(403)
        expect(tokens.createHashed).not.toHaveBeenCalled()
    })
})
