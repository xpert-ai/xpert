import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IApiPrincipal, SecretTokenBindingType, TClientSecretGrantSource } from '@xpert-ai/contracts'
import { AssertUserXpertGrantHandler } from './assert-user-xpert-grant.handler'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'
import { WorkbenchAssistantConversationNavigationService } from '../../../chat-conversation/workbench-assistant-conversation-navigation.service'

describe('live user Assistant delegation', () => {
    const assistants = { getAccessiblePublishedXpertForCurrentUser: jest.fn() }
    const projects = { assertCanReadXpert: jest.fn() }
    const navigation = { resolve: jest.fn() }
    const handler = new AssertUserXpertGrantHandler(
        assistants as unknown as PublishedXpertAccessService,
        projects as unknown as XpertProjectAccessService,
        navigation as unknown as WorkbenchAssistantConversationNavigationService
    )
    const principal = (source?: TClientSecretGrantSource) =>
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'bound' },
            grantSource: source
        } as IApiPrincipal)
    beforeEach(() => jest.resetAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it.each([undefined, { kind: 'assistant' } as const])('rechecks direct and legacy grants: %j', async (source) => {
        principal(source)
        await handler.execute()
        expect(assistants.getAccessiblePublishedXpertForCurrentUser).toHaveBeenCalledWith('bound')
        assistants.getAccessiblePublishedXpertForCurrentUser.mockRejectedValueOnce(new ForbiddenException())
        await expect(handler.execute()).rejects.toThrow(ForbiddenException)
        expect(projects.assertCanReadXpert).not.toHaveBeenCalled()
    })
    it('keeps Project delegation tied to its original live membership and Assistant binding', async () => {
        principal({ kind: 'project', projectId: 'original' })
        await handler.execute()
        expect(projects.assertCanReadXpert).toHaveBeenCalledWith('original', 'bound')
        expect(assistants.getAccessiblePublishedXpertForCurrentUser).not.toHaveBeenCalled()
        projects.assertCanReadXpert.mockRejectedValueOnce(new ForbiddenException())
        await expect(handler.execute()).rejects.toThrow(ForbiddenException)
    })
    it('rechecks the original conversation navigation and rejects a changed target', async () => {
        principal({ kind: 'conversation', conversationId: 'conversation', requesterXpertId: 'requester' })
        navigation.resolve.mockResolvedValue({ xpertId: 'bound' })
        await handler.execute()
        expect(navigation.resolve).toHaveBeenCalledWith('conversation', 'requester')
        navigation.resolve.mockResolvedValue({ xpertId: 'other' })
        await expect(handler.execute()).rejects.toThrow(ForbiddenException)
    })
})
