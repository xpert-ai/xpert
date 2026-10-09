import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ApiKeyBindingType, IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { AssistantThreadScopeGuard } from './assistant-thread-scope.guard'

describe('AssistantThreadScopeGuard', () => {
    const conversations = { findOneBy: jest.fn() }
    const threads = { findOne: jest.fn() }
    const guard = new AssistantThreadScopeGuard(
        conversations as unknown as ConstructorParameters<typeof AssistantThreadScopeGuard>[0],
        threads as unknown as ConstructorParameters<typeof AssistantThreadScopeGuard>[1]
    )
    let principal: IApiPrincipal

    function context(params: { threadId?: string; thread_id?: string } = { thread_id: 'thread' }, user = principal) {
        return { switchToHttp: () => ({ getRequest: () => ({ user, params }) }) } as ExecutionContext
    }

    beforeEach(() => {
        jest.clearAllMocks()
        principal = {
            id: 'user',
            tenantId: 'tenant',
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            resourceScope: { kind: 'assistant', xpertId: 'assistant' },
            apiKey: { token: '', type: ApiKeyBindingType.ASSISTANT, entityId: 'assistant', tenantId: 'tenant' }
        } as IApiPrincipal
        threads.findOne.mockResolvedValue({
            conversation: { xpertId: 'assistant', tenantId: 'tenant', organizationId: null, createdById: 'user' }
        })
        conversations.findOneBy.mockResolvedValue(null)
    })

    it('fails closed when used without prior authentication', async () => {
        await expect(guard.canActivate(context(undefined, null))).rejects.toThrow(UnauthorizedException)
        expect(threads.findOne).not.toHaveBeenCalled()
    })

    it('supports SDK snake_case thread parameters and tenant-level Assistant bindings', async () => {
        await expect(guard.canActivate(context())).resolves.toBe(true)
        expect(threads.findOne).toHaveBeenCalledWith({
            where: { threadId: 'thread' },
            relations: { conversation: true }
        })
    })

    it.each([{}, { threadId: 'thread', thread_id: 'other-thread' }])(
        'rejects missing or ambiguous thread parameters (%p)',
        async (params) => {
            await expect(guard.canActivate(context(params))).rejects.toThrow(ForbiddenException)
            expect(threads.findOne).not.toHaveBeenCalled()
        }
    )

    it('rejects nonexistent threads', async () => {
        threads.findOne.mockResolvedValue(null)
        await expect(guard.canActivate(context())).rejects.toThrow(ForbiddenException)
    })

    it.each([SecretTokenBindingType.PUBLIC_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT])(
        'requires conversation ownership for restricted sessions (%s)',
        async (bindingType) => {
            // Enterprise route opt-in is enforced by the preceding authentication guard.
            principal.clientSecretBindingType = bindingType
            await expect(guard.canActivate(context())).resolves.toBe(true)
            threads.findOne.mockResolvedValue({
                conversation: {
                    xpertId: 'assistant',
                    tenantId: 'tenant',
                    organizationId: null,
                    createdById: 'another-user'
                }
            })
            await expect(guard.canActivate(context())).rejects.toThrow(ForbiddenException)
        }
    )
})
