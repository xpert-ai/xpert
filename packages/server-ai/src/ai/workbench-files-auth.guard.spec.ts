import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ApiKeyBindingType, IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { WorkbenchFilesAuthGuard } from './workbench-files-auth.guard'

class TestGuard extends WorkbenchFilesAuthGuard {
    protected override authenticateClientSecret() {
        return true
    }
}

describe('Workbench files route authorization', () => {
    const principal = {
        id: 'user',
        tenantId: 'tenant',
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
        resourceScope: { kind: 'assistant', xpertId: 'assistant' },
        apiKey: { type: ApiKeyBindingType.ASSISTANT, entityId: 'assistant', tenantId: 'tenant', organizationId: 'org' }
    } as IApiPrincipal
    function context(user = principal): ExecutionContext {
        const request = {
            headers: { 'x-client-secret': 'cs-x-test' },
            user,
            params: { conversationId: 'conversation' }
        }
        return {
            getHandler: () => () => undefined,
            getClass: () => TestGuard,
            switchToHttp: () => ({ getRequest: () => request })
        } as unknown as ExecutionContext
    }
    function setup(conversation: Partial<ChatConversation> | null) {
        const findOneBy = jest.fn().mockResolvedValue(conversation)
        const guard = new TestGuard(new Reflector(), { findOneBy } as unknown as Repository<ChatConversation>)
        return { guard, findOneBy }
    }
    it('loads the persisted conversation before allowing access', async () => {
        const { guard, findOneBy } = setup({
            id: 'conversation',
            xpertId: 'assistant',
            tenantId: 'tenant',
            organizationId: 'org'
        })
        await expect(guard.canActivate(context())).resolves.toBe(true)
        expect(findOneBy).toHaveBeenCalledWith({ id: 'conversation' })
    })
    it('rejects a conversation from another Assistant', async () => {
        const { guard } = setup({ xpertId: 'other', tenantId: 'tenant', organizationId: 'org' })
        await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('does not query conversation data for a public client secret', async () => {
        const { guard, findOneBy } = setup(null)
        await expect(
            guard.canActivate(context({ ...principal, clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT }))
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(findOneBy).not.toHaveBeenCalled()
    })
    it('returns not found for a missing conversation', async () => {
        const { guard } = setup(null)
        await expect(guard.canActivate(context())).rejects.toBeInstanceOf(NotFoundException)
    })
})
