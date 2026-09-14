import { Controller, Delete, Get, Param, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { UUIDValidationPipe } from '@xpert-ai/server-core'
import { KnowledgeTagService } from './knowledge-tag.service'

@ApiTags('KnowledgeTags')
@ApiBearerAuth()
@Controller(':knowledgebaseId')
export class KnowledgeTagController {
    constructor(private readonly tags: KnowledgeTagService) {}

    @Get('tags')
    list(@Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string) {
        return this.tags.list(knowledgebaseId)
    }

    @Put('tags/:tagId')
    select(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('tagId', UUIDValidationPipe) tagId: string
    ) {
        return this.tags.select(knowledgebaseId, tagId)
    }

    @Delete('tags/:tagId')
    unselect(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('tagId', UUIDValidationPipe) tagId: string
    ) {
        return this.tags.select(knowledgebaseId, tagId, true)
    }

    @Get('documents/:documentId/tags')
    documentTags(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('documentId', UUIDValidationPipe) documentId: string
    ) {
        return this.tags.documentTags(knowledgebaseId, documentId)
    }

    @Put('documents/:documentId/tags/:tagId')
    addManual(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('documentId', UUIDValidationPipe) documentId: string,
        @Param('tagId', UUIDValidationPipe) tagId: string
    ) {
        return this.tags.setManual(knowledgebaseId, documentId, tagId)
    }

    @Delete('documents/:documentId/tags/:tagId')
    removeManual(
        @Param('knowledgebaseId', UUIDValidationPipe) knowledgebaseId: string,
        @Param('documentId', UUIDValidationPipe) documentId: string,
        @Param('tagId', UUIDValidationPipe) tagId: string
    ) {
        return this.tags.setManual(knowledgebaseId, documentId, tagId, true)
    }
}
