import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard, Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { ConversationSharingService } from './share.service'
import { createShareSchema, previewSchema, ShareCreateInput, SharePreviewInput, invalidShare } from './share.schema'

@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('conversations/:conversationId')
export class ConversationSharingController {
    constructor(private readonly shares: ConversationSharingService) {}

    @Post('share-preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    preview(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(previewSchema, invalidShare)) input: SharePreviewInput
    ) {
        return this.shares.preview(id, input.threadId)
    }

    @Post('shares')
    @Header('Cache-Control', 'no-store')
    create(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(createShareSchema, invalidShare)) input: ShareCreateInput
    ) {
        return this.shares.create(id, input)
    }

    @Get('shares')
    @Header('Cache-Control', 'no-store')
    list(@Param('conversationId', UUIDValidationPipe) id: string) {
        return this.shares.list(id)
    }

    @Delete('shares/:shareId')
    @HttpCode(204)
    revoke(
        @Param('conversationId', UUIDValidationPipe) id: string,
        @Param('shareId', UUIDValidationPipe) shareId: string
    ) {
        return this.shares.revoke(id, shareId)
    }
}

@Public()
@Controller('shared-conversations')
export class SharedConversationController {
    constructor(private readonly shares: ConversationSharingService) {}

    @Get(':token')
    @Header('Cache-Control', 'no-store, private')
    @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
    @Header('Referrer-Policy', 'no-referrer')
    read(@Param('token') token: string) {
        return this.shares.read(token, false)
    }

    @Get(':token/authenticated')
    @UseGuards(ApiKeyOrClientSecretAuthGuard)
    @Header('Cache-Control', 'no-store, private')
    @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
    @Header('Referrer-Policy', 'no-referrer')
    readAuthenticated(@Param('token') token: string) {
        return this.shares.read(token, true)
    }
}
