import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { XpertProjectAuthGuard } from './project-auth.guard'

describe('XpertProjectAuthGuard', () => {
    class TestGuard extends XpertProjectAuthGuard {
        protected override authenticateClientSecret() {
            return true
        }
    }

    function context(bindingType: SecretTokenBindingType): ExecutionContext {
        const principal = {
            id: 'user-1',
            principalType: 'client_secret',
            clientSecretBindingType: bindingType
        } as IApiPrincipal
        const request = {
            headers: { authorization: 'Bearer cs-x-test' },
            user: principal
        }

        return {
            getClass: () => class TestController {},
            getHandler: () => () => undefined,
            switchToHttp: () => ({ getRequest: () => request })
        } as unknown as ExecutionContext
    }

    it('accepts delegated user ChatKit sessions', async () => {
        const guard = new TestGuard(new Reflector())

        await expect(guard.canActivate(context(SecretTokenBindingType.USER_XPERT))).resolves.toBe(true)
    })

    it.each([
        SecretTokenBindingType.PUBLIC_XPERT,
        SecretTokenBindingType.ENTERPRISE_XPERT,
        SecretTokenBindingType.API_KEY
    ])('rejects non-interactive client secret binding %s', async (bindingType) => {
        const guard = new TestGuard(new Reflector())

        await expect(guard.canActivate(context(bindingType))).rejects.toBeInstanceOf(ForbiddenException)
    })
})
