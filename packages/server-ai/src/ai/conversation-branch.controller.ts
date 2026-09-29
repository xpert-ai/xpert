import { Body, Controller, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { SecretTokenBindingType, TConversationBranchRequest } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor,
    UUIDValidationPipe
} from '@xpert-ai/server-core'
import { ConversationBranchService } from '../chat-conversation/conversation-branch.service'
import { ConversationDTO } from './dto/conversation.dto'

@ApiTags('AI/Conversations')
@ApiBearerAuth()
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('conversations')
export class ConversationBranchController {
    constructor(private readonly branches: ConversationBranchService) {}

    @Post(':conversationId/branch')
    async branch(
        @Param('conversationId', UUIDValidationPipe) conversationId: string,
        @Body() input: TConversationBranchRequest
    ) {
        return new ConversationDTO(await this.branches.branch(conversationId, input))
    }
}
