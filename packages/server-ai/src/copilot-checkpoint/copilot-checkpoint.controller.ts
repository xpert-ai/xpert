import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Query,
    UseInterceptors
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { QueryBus } from '@nestjs/cqrs'
import { DeepPartial } from 'typeorm'
import { PaginationParams, TransformInterceptor } from '@xpert-ai/server-core'
import { ParseJsonPipe, UseValidationPipe } from '@xpert-ai/server-core'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointService } from './copilot-checkpoint.service'
import { CopilotCheckpointWritesService } from './writes/writes.service'
import { CheckpointTuple } from '@langchain/langgraph'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { assertPublicXpertSessionConversationAccess } from '../ai/public-xpert-principal'
import { t } from 'i18next'

@ApiTags('CopilotCheckpoint')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotCheckpointController {
    constructor(
        private readonly service: CopilotCheckpointService,
        private readonly writesService: CopilotCheckpointWritesService,
        private readonly queryBus: QueryBus
    ) {}

    @Get()
    @UseValidationPipe()
    async getTuple(
        @Query('$filter', ParseJsonPipe) where: PaginationParams<CopilotCheckpoint>['where'],
        @Query('$relations', ParseJsonPipe) relations: PaginationParams<CopilotCheckpoint>['relations'],
        @Query('$order', ParseJsonPipe) order: PaginationParams<CopilotCheckpoint>['order']
    ): Promise<CheckpointTuple | null> {
        await this.assertThreadAccess(readCheckpointThreadId(where), 'read')
        return await this.service.getTuple(where)
    }

    @ApiOperation({ summary: 'Create new record' })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'The record has been successfully created.' /*, type: T*/
    })
    @ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input, The response body may contain clues as to what went wrong'
    })
    @HttpCode(HttpStatus.CREATED)
    @Post()
    async create(@Body() entity: DeepPartial<CopilotCheckpoint>, ...options: any[]): Promise<CopilotCheckpoint> {
        await this.assertThreadAccess(readCheckpointThreadId(entity), 'contribute')
        return await this.service.upsert(entity)
    }

    @HttpCode(HttpStatus.CREATED)
    @Post('writes')
    async createWrites(@Body() entities: Partial<CopilotCheckpointWrites>[], ...options: any[]): Promise<void> {
        const threadIds = new Set(entities.map((entity) => readCheckpointThreadId(entity)))
        for (const threadId of threadIds) {
            await this.assertThreadAccess(threadId, 'contribute')
        }
        await this.writesService.upsert(entities)
    }

    private async assertThreadAccess(threadId: string, operation: 'read' | 'contribute') {
        const conversation = await this.queryBus.execute(new AssertChatConversationAccessQuery({ threadId }, operation))
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
    }
}

function readCheckpointThreadId(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw invalidCheckpointThread()
    }
    const threadId = Reflect.get(value, 'thread_id')
    if (typeof threadId !== 'string' || !threadId.trim()) {
        throw invalidCheckpointThread()
    }
    return threadId.trim()
}

function invalidCheckpointThread() {
    return new BadRequestException(
        t('server-ai:Error.CheckpointThreadRequired', {
            defaultValue: 'A checkpoint thread is required'
        })
    )
}
