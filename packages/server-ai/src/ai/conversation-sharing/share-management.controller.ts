import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiKeyOrClientSecretAuthGuard, Public, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { ConversationSharingService } from './share.service'
import {
    invalidShare,
    revokeAllSharesSchema,
    RevokeAllSharesInput,
    shareListSchema,
    ShareListInput
} from './share.schema'

/** Authentication is followed by an interactive owner check; a delegated chat cannot enumerate personal exports. */
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@Controller('conversation-shares')
export class ConversationShareManagementController {
    constructor(private readonly shares: ConversationSharingService) {}

    @Get()
    @Header('Cache-Control', 'no-store, private')
    list(@Query(new ZodValidationPipe(shareListSchema, invalidShare)) query: ShareListInput) {
        return this.shares.listMine(query)
    }

    @Get(':shareId')
    @Header('Cache-Control', 'no-store, private')
    preview(@Param('shareId', UUIDValidationPipe) id: string) {
        return this.shares.previewMine(id)
    }

    @Delete(':shareId')
    @HttpCode(204)
    @Header('Cache-Control', 'no-store')
    revoke(@Param('shareId', UUIDValidationPipe) id: string) {
        return this.shares.revokeMine(id)
    }

    @Post('revoke-all')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    revokeAll(@Body(new ZodValidationPipe(revokeAllSharesSchema, invalidShare)) input: RevokeAllSharesInput) {
        return this.shares.revokeAllMine(input)
    }
}
