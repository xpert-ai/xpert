import { BadRequestException, Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Permissions,
    Public,
    UUIDValidationPipe,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { AIPermissionsEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { ToolDetailsService } from '../../chat-conversation/tool-details/tool-details.service'
import { toolDetailQuerySchema, type ToolDetailQuery } from '../../chat-conversation/tool-details/tool-detail.schema'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Permissions(AIPermissionsEnum.CHAT_VIEW)
@Controller('conversations/:conversationId/tool-details')
export class ToolDetailsController {
    constructor(private readonly details: ToolDetailsService) {}

    @Get(':id')
    @Header('Cache-Control', 'private, no-store')
    read(
        @Param('conversationId', UUIDValidationPipe) conversationId: string,
        @Param('id', UUIDValidationPipe) id: string,
        @Query(
            new ZodValidationPipe(
                toolDetailQuerySchema,
                () => new BadRequestException(t('server-ai:Error.ToolDetailRequestInvalid'))
            )
        )
        query: ToolDetailQuery
    ) {
        const { offset, ...ref } = query
        return this.details.read({ conversationId, id, ...ref }, offset)
    }
}
