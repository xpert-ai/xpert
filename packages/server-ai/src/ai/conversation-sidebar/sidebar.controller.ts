import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    Header,
    HttpCode,
    NotImplementedException,
    Param,
    Patch,
    Post,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { AIPermissionsEnum, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { QueryBus } from '@nestjs/cqrs'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Permissions,
    Public,
    TransformInterceptor,
    UUIDValidationPipe,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ChatConversationSidebarService } from '../../chat-conversation/conversation-sidebar.service'
import { ChatConversationService } from '../../chat-conversation/conversation.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { ConversationDTO } from '../dto/conversation.dto'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionConversationScope
} from '../public-xpert-principal'
import {
    invalidSidebar,
    sidebarListSchema,
    SidebarListInput,
    sidebarPatchSchema,
    SidebarPatchInput
} from './sidebar.schema'

/** Personal preferences keep owner isolation and the credential's Assistant audience. */
@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Permissions(AIPermissionsEnum.CHAT_VIEW)
@Controller('conversations')
export class ConversationSidebarController {
    constructor(
        private readonly sidebar: ChatConversationSidebarService,
        private readonly conversations: ChatConversationService,
        private readonly published: PublishedXpertAccessService,
        private readonly queries: QueryBus
    ) {}

    @Post('sidebar/search')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    async list(@Body(new ZodValidationPipe(sidebarListSchema, invalidSidebar)) input: SidebarListInput) {
        this.assertPersonalSession()
        const ids = await this.published.getAccessiblePublishedXpertFamilyIds(input.assistantId)
        const assistant = await this.published.getAccessiblePublishedXpert(input.assistantId)
        // Preserve the existing history's read-only inclusion of an owned
        // Assistant's technical account. Personal preference writes remain owner-only.
        const technicalUserId = assistant.createdById === RequestContext.currentUserId() ? assistant.userId : undefined
        const page = await this.sidebar.list(
            ids,
            input.limit,
            input.offset,
            input.archived,
            input.search,
            input.projectId,
            technicalUserId
        )
        return { ...page, items: page.items.map((item) => new ConversationDTO(item)) }
    }

    @Get(':id/sidebar')
    @Header('Cache-Control', 'no-store')
    async read(@Param('id', UUIDValidationPipe) id: string) {
        await this.authorize(id)
        return this.sidebar.read(id)
    }

    @Patch(':id/sidebar')
    @Header('Cache-Control', 'no-store')
    async update(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(new ZodValidationPipe(sidebarPatchSchema, invalidSidebar)) input: SidebarPatchInput
    ) {
        await this.authorize(id)
        return this.sidebar.update(id, input)
    }

    private assertPersonalSession() {
        // Assistant-bound service sessions have no personal sidebar. Their existing
        // history API remains usable; preference changes require a human principal.
        if (getPublicXpertSessionConversationScope()) {
            throw new NotImplementedException(t('server-ai:Error.AssistantUserPreferenceUserRequired'))
        }
    }

    private async authorize(id: string) {
        this.assertPersonalSession()
        const conversation = await this.conversations.assertAccess(id)
        if (!conversation.xpertId) throw new ForbiddenException(t('server-ai:Error.ConversationSidebarOwnerRequired'))
        // This shared policy permits historical versions in a delegated user's
        // bound Assistant family, while rejecting other Assistant audiences.
        await assertPublicXpertSessionConversationAccess(conversation, this.queries)
    }
}
