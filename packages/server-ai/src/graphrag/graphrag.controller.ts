import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    KnowledgeGraphEntityChunksQuery,
    KnowledgeGraphMentionListQuery,
    KnowledgeGraphVisualizationQuery
} from '@xpert-ai/contracts'
import { KnowledgeGraphEntity } from './entities'
import { GraphragService } from './graphrag.service'

@ApiTags('KnowledgeGraph')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller(':id/graph')
export class GraphragController {
    constructor(private readonly service: GraphragService) {}

    @Post('rebuild')
    async rebuild(@Param('id') id: string) {
        return this.service.rebuildKnowledgebase(id)
    }

    @Get('status')
    async status(@Param('id') id: string) {
        return this.service.getStatus(id)
    }

    @Get('entities')
    async entities(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) params?: PaginationParams<KnowledgeGraphEntity>
    ) {
        return this.service.listEntities(id, params)
    }

    @Post('entities')
    async createEntity(@Param('id') id: string, @Body() body: unknown) {
        return this.service.createEntity(id, body)
    }

    @Patch('entities/:entityId')
    async updateEntity(@Param('id') id: string, @Param('entityId') entityId: string, @Body() body: unknown) {
        return this.service.updateEntity(id, entityId, body)
    }

    @Delete('entities/:entityId')
    async deleteEntity(@Param('id') id: string, @Param('entityId') entityId: string) {
        return this.service.hideEntity(id, entityId)
    }

    @Get('entities/:entityId/neighborhood')
    async neighborhood(@Param('id') id: string, @Param('entityId') entityId: string) {
        return this.service.getNeighborhood(id, entityId)
    }

    @Get('entities/:entityId/chunks')
    async entityChunks(
        @Param('id') id: string,
        @Param('entityId') entityId: string,
        @Query('data', ParseJsonPipe) query?: KnowledgeGraphEntityChunksQuery
    ) {
        return this.service.getEntityChunks(id, entityId, query)
    }

    @Get('visualization')
    async visualization(
        @Param('id') id: string,
        @Query('data', ParseJsonPipe) query?: KnowledgeGraphVisualizationQuery
    ) {
        return this.service.getVisualization(id, query)
    }

    @Get('relations')
    async relations(@Param('id') id: string, @Query('data', ParseJsonPipe) params?: KnowledgeGraphVisualizationQuery) {
        return this.service.listRelations(id, params)
    }

    @Post('relations')
    async createRelation(@Param('id') id: string, @Body() body: unknown) {
        return this.service.createRelation(id, body)
    }

    @Patch('relations/:relationId')
    async updateRelation(@Param('id') id: string, @Param('relationId') relationId: string, @Body() body: unknown) {
        return this.service.updateRelation(id, relationId, body)
    }

    @Delete('relations/:relationId')
    async deleteRelation(@Param('id') id: string, @Param('relationId') relationId: string) {
        return this.service.hideRelation(id, relationId)
    }

    @Get('mentions')
    async mentions(@Param('id') id: string, @Query('data', ParseJsonPipe) query?: KnowledgeGraphMentionListQuery) {
        return this.service.listMentions(id, query)
    }
}
