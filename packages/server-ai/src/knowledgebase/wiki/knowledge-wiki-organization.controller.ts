import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UsePipes,
    ValidationPipe
} from '@nestjs/common'
import { UUIDValidationPipe } from '@xpert-ai/server-core'
import { KnowledgeWikiOrganizationService } from './knowledge-wiki-organization.service'
import { KnowledgeWikiBrowseService } from './knowledge-wiki-browse.service'
import { KnowledgeWikiClassificationService } from './knowledge-wiki-classification.service'
import {
    WikiClassificationApplyDTO,
    WikiClassificationQueryDTO,
    WikiClassificationRunDTO,
    WikiFolderDTO,
    WikiGraphQueryDTO,
    WikiPlacementDTO,
    WikiTaxonomyConfigDTO,
    WikiTaxonomyQueryDTO,
    WikiVersionDTO
} from './dto/knowledge-wiki-organization.dto'

@Controller(':knowledgebaseId/wiki')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class KnowledgeWikiOrganizationController {
    constructor(
        private readonly organization: KnowledgeWikiOrganizationService,
        private readonly browse: KnowledgeWikiBrowseService,
        private readonly classification: KnowledgeWikiClassificationService
    ) {}

    @Get('folders') folders(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Query() query: WikiTaxonomyQueryDTO
    ) {
        return this.browse.taxonomy(id, query)
    }
    @Patch('taxonomy') configure(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Body() body: WikiTaxonomyConfigDTO
    ) {
        return this.organization.configure(id, body.enabled, body.revision)
    }
    @Post('folders') create(@Param('knowledgebaseId', UUIDValidationPipe) id: string, @Body() body: WikiFolderDTO) {
        return this.organization.saveFolder(id, body)
    }
    @Patch('folders/:folderId') update(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Param('folderId', UUIDValidationPipe) folder: string,
        @Body() body: WikiFolderDTO
    ) {
        return this.organization.saveFolder(id, body, folder, body.version)
    }
    @Delete('folders/:folderId') @HttpCode(204) remove(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Param('folderId', UUIDValidationPipe) folder: string,
        @Query() query: WikiVersionDTO
    ) {
        return this.organization.deleteFolder(id, folder, query.version)
    }
    @Patch('pages/:pageId/placement') move(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Param('pageId', UUIDValidationPipe) page: string,
        @Body() body: WikiPlacementDTO
    ) {
        return this.organization.movePage(id, page, body.folderId, body.version)
    }
    @Get('classification-runs/status') classificationStatus(@Param('knowledgebaseId', UUIDValidationPipe) id: string) {
        return this.classification.status(id)
    }
    @Get('classification-runs') runs(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Query() query: WikiClassificationQueryDTO
    ) {
        return this.classification.list(id, query.runId)
    }
    @Post('classification-runs') start(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Body() body: WikiClassificationRunDTO
    ) {
        return this.classification.start(id, body.unclassifiedOnly)
    }
    @Post('classification-runs/apply') apply(
        @Param('knowledgebaseId', UUIDValidationPipe) id: string,
        @Body() body: WikiClassificationApplyDTO
    ) {
        return this.classification.apply(id, body.jobIds)
    }
    @Get('graph') graph(@Param('knowledgebaseId', UUIDValidationPipe) id: string, @Query() query: WikiGraphQueryDTO) {
        return this.browse.graph(id, query)
    }
}
