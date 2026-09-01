import { ApiKeyBindingType, IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertWorkspaceAuthGuard } from './xpert-workspace-auth.guard'

describe('XpertWorkspaceAuthGuard', () => {
    class TestGuard extends XpertWorkspaceAuthGuard {
        protected override authenticateClientSecret() {
            return true
        }
    }

    function context(principal: IApiPrincipal, xpertId = 'xpert-1'): ExecutionContext {
        const request = {
            headers: { authorization: 'Bearer cs-x-test' },
            params: { id: xpertId },
            user: principal
        }

        return {
            getClass: () => class TestController {},
            getHandler: () => () => undefined,
            switchToHttp: () => ({ getRequest: () => request })
        } as unknown as ExecutionContext
    }

    function userXpertPrincipal(entityId: string): IApiPrincipal {
        return {
            id: 'user-1',
            principalType: 'client_secret',
            clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
            apiKey: {
                type: ApiKeyBindingType.ASSISTANT,
                entityId
            }
        } as IApiPrincipal
    }

    it('accepts a delegated user session bound to the requested assistant', async () => {
        const guard = new TestGuard(new Reflector())

        await expect(guard.canActivate(context(userXpertPrincipal('xpert-1')))).resolves.toBe(true)
    })

    it('rejects a delegated user session bound to another assistant', async () => {
        const guard = new TestGuard(new Reflector())

        await expect(guard.canActivate(context(userXpertPrincipal('xpert-2')))).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('rejects a delegated session without an assistant API binding', async () => {
        const guard = new TestGuard(new Reflector())
        const principal = {
            ...userXpertPrincipal('xpert-1'),
            apiKey: {
                type: ApiKeyBindingType.WORKSPACE,
                entityId: 'xpert-1'
            }
        } as IApiPrincipal

        await expect(guard.canActivate(context(principal))).rejects.toBeInstanceOf(ForbiddenException)
    })

    it.each([SecretTokenBindingType.PUBLIC_XPERT, SecretTokenBindingType.ENTERPRISE_XPERT])(
        'rejects non-interactive client secret binding %s',
        async (bindingType) => {
            const guard = new TestGuard(new Reflector())
            const principal = {
                ...userXpertPrincipal('xpert-1'),
                clientSecretBindingType: bindingType
            } as IApiPrincipal

            await expect(guard.canActivate(context(principal))).rejects.toBeInstanceOf(ForbiddenException)
        }
    )
})
