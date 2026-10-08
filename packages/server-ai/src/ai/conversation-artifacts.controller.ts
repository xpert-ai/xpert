import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    UUIDValidationPipe
} from '@xpert-ai/server-core'
import type { Response } from 'express'
import { ReadConversationArtifactCommand } from '../chat-conversation/commands/read-conversation-artifact.command'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('conversations/:conversationId/artifacts')
export class ConversationArtifactsController {
    constructor(private readonly commandBus: CommandBus) {}

    @Get(':artifactId/versions/:artifactVersionId/content')
    async read(
        @Param('conversationId', UUIDValidationPipe) conversationId: string,
        @Param('artifactId', UUIDValidationPipe) artifactId: string,
        @Param('artifactVersionId', UUIDValidationPipe) artifactVersionId: string,
        @Res() response: Response
    ) {
        const file = await this.commandBus.execute(
            new ReadConversationArtifactCommand(conversationId, { artifactId, artifactVersionId })
        )
        response.set({
            'Content-Type': file.mimeType,
            'Content-Length': String(file.buffer.length),
            'Content-Disposition': 'attachment',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "sandbox; default-src 'none'",
            'Referrer-Policy': 'no-referrer'
        })
        response.send(file.buffer)
    }
}
