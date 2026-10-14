import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, AllowClientSecretBindings } from '@xpert-ai/server-core'
import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common'
import {
    Public,
    TransformInterceptor,
    UUIDValidationPipe,
    ViewExtensionRoutes,
    ViewExtensionService
} from '@xpert-ai/server-core'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupWorkbenchGuard } from './group-workbench.guard'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups/:groupId/workbench')
export class GroupWorkbenchContextController {
    constructor(private readonly scope: GroupWorkbenchGuard) {}
    @Get('context')
    context(@Param('groupId', UUIDValidationPipe) groupId: string) {
        return this.scope.resolve(groupId)
    }
}

/** Reuses private conversation Views without duplicating manifests, data or action handlers. */
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard, GroupWorkbenchGuard)
@UseInterceptors(TransformInterceptor)
@Controller('groups/:groupId/workbench')
export class GroupViewsController extends ViewExtensionRoutes {
    constructor(service: ViewExtensionService) {
        super(service)
    }
}
