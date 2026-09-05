import {
    Body,
    Controller,
    DefaultValuePipe,
    Get,
    Param,
    ParseBoolPipe,
    ParseIntPipe,
    Patch,
    Query
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TChatConversationSidebarState } from '@xpert-ai/contracts'
import { UUIDValidationPipe } from '@xpert-ai/server-core'
import { ChatConversationSidebarService } from './conversation-sidebar.service'

@ApiTags('ChatConversation')
@ApiBearerAuth()
@Controller()
export class ChatConversationSidebarController {
    constructor(private readonly sidebar: ChatConversationSidebarService) {}

    @Get('my/sidebar')
    list(
        @Query('xpertId', UUIDValidationPipe) xpertId: string,
        @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
        @Query('archived', new DefaultValuePipe(false), ParseBoolPipe) archived: boolean
    ) {
        return this.sidebar.list(xpertId, take, skip, archived)
    }

    @Patch(':id/sidebar')
    update(@Param('id', UUIDValidationPipe) id: string, @Body() patch: Partial<TChatConversationSidebarState>) {
        return this.sidebar.update(id, patch)
    }
}
