import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { SecretTokenBindingType, ChatGroupProjectInput } from '@xpert-ai/contracts'
import {
    Public,
    ApiKeyOrClientSecretAuthGuard,
    AllowClientSecretBindings,
    UUIDValidationPipe,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { GroupScopeGuard } from './group-scope.guard'
import { GroupProjectService } from '../../chat-group/group-project/group-project.service'
import { groupProjectSchema } from '../../chat-group/group-project/group-project.schema'
import { groupInvalid } from '../../chat-group/group.errors'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.USER_CONVERSATION)
@UseGuards(ApiKeyOrClientSecretAuthGuard, GroupScopeGuard)
@Controller('groups/:groupId/project')
export class GroupProjectController {
    constructor(private readonly projects: GroupProjectService) {}
    @Get()
    get(@Param('groupId', UUIDValidationPipe) id: string) {
        return this.projects.get(id)
    }
    @Put()
    set(
        @Param('groupId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(groupProjectSchema, groupInvalid)) input: ChatGroupProjectInput
    ) {
        return this.projects.set(id, input)
    }
}
