import { Body, Controller, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { SecretTokenBindingType, TConversationBranchRequest } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor,
    UUIDValidationPipe
} from '@xpert-ai/server-core'
import { ConversationBranchCommand } from '../chat-conversation/conversation-branch/branch.command'
import { ConversationDTO } from './dto/conversation.dto'

@ApiTags('AI/Conversations')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('conversations')
export class ConversationBranchController {
    constructor(private readonly commands: CommandBus) {}

    @Post(':conversationId/branch')
    async branch(
        @Param('conversationId', UUIDValidationPipe) conversationId: string,
        @Body() input: TConversationBranchRequest
    ) {
        return new ConversationDTO(await this.commands.execute(new ConversationBranchCommand(conversationId, input)))
    }
}
