import { GUARDS_METADATA } from '@nestjs/common/constants'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, ALLOWED_CLIENT_SECRET_BINDINGS_METADATA } from '@xpert-ai/server-core'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupViewsController, GroupWorkbenchContextController } from './group-workbench.controller'
import { GroupViewFilesController } from './group-view-files.controller'

describe('group Workbench credential boundary', () => {
    it.each([GroupViewsController, GroupWorkbenchContextController, GroupViewFilesController])(
        'authenticates and checks conversation scope before Workbench access on %p',
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
})
