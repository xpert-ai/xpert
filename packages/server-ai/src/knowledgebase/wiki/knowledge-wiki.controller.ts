import { Inject } from '@nestjs/common'
import { KnowledgeWikiBrowseService } from './knowledge-wiki-browse.service'
import { RequestContext, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Post, Put, Query, ValidationPipe } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    KnowledgeWikiPageListQueryDTO,
    RebuildKnowledgeWikiDTO,
    RetryKnowledgeWikiJobDTO,
    UpdateKnowledgeWikiConfigDTO
} from './dto'
import { KnowledgeWikiService } from './knowledge-wiki.service'
import { KnowledgeWikiDocumentStatusQueryDTO } from './dto/knowledge-wiki-document-status-query.dto'

@ApiTags('KnowledgeWiki')
@ApiBearerAuth()
@Controller(':knowledgebaseId/wiki')
export class KnowledgeWikiController {
    @Inject(KnowledgeWikiBrowseService) private readonly browse: KnowledgeWikiBrowseService
    constructor(private readonly service: KnowledgeWikiService) {}

    @Get('status')
    getStatus(@Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string) {
        return this.service.getStatus(knowledgebaseId)
    }

    @Put('config')
    updateConfiguration(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Body() input: UpdateKnowledgeWikiConfigDTO
    ) {
        return this.service.updateConfiguration(knowledgebaseId, input)
    }

    @Get('documents/status')
    getDocumentStatus(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Query(new ValidationPipe({ transform: true, whitelist: true })) query: KnowledgeWikiDocumentStatusQueryDTO
    ) {
        return this.service.getDocumentStatus(knowledgebaseId, query.documentIds)
    }

    @Post('rebuild')
    rebuild(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Body() input: RebuildKnowledgeWikiDTO
    ) {
        return this.service.rebuild(knowledgebaseId, input, RequestContext.currentUserId())
    }

    @Post('jobs/:jobId/retry')
    retry(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('jobId', UUIDValidationPipe) jobId: string,
        @Body() input: RetryKnowledgeWikiJobDTO
    ) {
        return this.service.retry(knowledgebaseId, jobId, input, RequestContext.currentUserId())
    }

    @Get('pages')
    listPages(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Query(new ValidationPipe({ transform: true, whitelist: true })) query: KnowledgeWikiPageListQueryDTO
    ) {
        return query.status && query.status !== 'ready'
            ? this.service.listPages(knowledgebaseId, query)
            : this.browse.list(knowledgebaseId, query)
    }

    @Get('pages/:pageId')
    async getPage(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('pageId', UUIDValidationPipe) pageId: string
    ) {
        return {
            ...(await this.service.getPage(knowledgebaseId, pageId)),
            placement: await this.browse.placement(knowledgebaseId, pageId)
        }
    }
}
