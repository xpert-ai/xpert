import { ExecutionContext } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, ALLOWED_CLIENT_SECRET_BINDINGS_METADATA } from '@xpert-ai/server-core'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupsController } from './group.controller'
import { GroupComposerController } from './group-composer.controller'

describe('group routes authenticate via shared ChatKit credentials before domain scope checks', () => {
    const access = { authorize: jest.fn().mockResolvedValue({}) }
    const guard = new GroupScopeGuard(access as never)
    const principal: IApiPrincipal = {
        id: 'A',
        principalType: 'client_secret',
        clientSecretBindingType: SecretTokenBindingType.USER_CONVERSATION
    } as IApiPrincipal
    const context = (groupId?: string, user = principal) =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ params: { groupId }, user }) })
        }) as unknown as ExecutionContext
    beforeEach(() => jest.clearAllMocks())
    it.each([GroupsController, GroupComposerController])(
        'requires shared authentication and explicit binding opt-in on %p',
        (controller) => {
            expect(Reflect.getMetadata(GUARDS_METADATA, controller).slice(0, 2)).toEqual([
                ApiKeyOrClientSecretAuthGuard,
                GroupScopeGuard
            ])
            expect(Reflect.getMetadata(ALLOWED_CLIENT_SECRET_BINDINGS_METADATA, controller)).toEqual([
                SecretTokenBindingType.USER_CONVERSATION
            ])
        }
    )
    it('does not let a conversation credential list or create groups outside its audience', async () => {
        await expect(guard.canActivate(context())).rejects.toMatchObject({ status: 403 })
        expect(access.authorize).not.toHaveBeenCalled()
    })
    it('authorizes each group business route through live membership and exact scope', async () => {
        await expect(guard.canActivate(context('D'))).resolves.toBe(true)
        expect(access.authorize).toHaveBeenCalledWith('D')
    })
    it('does not accept an Assistant secret as a group credential', async () => {
        await expect(
            guard.canActivate(
                context('D', { ...principal, clientSecretBindingType: SecretTokenBindingType.USER_XPERT })
            )
        ).rejects.toMatchObject({ status: 403 })
    })
})
