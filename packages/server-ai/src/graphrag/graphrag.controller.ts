import { PaginationParams, ParseJsonPipe, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
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

    @Get('entities/:entityId/neighborhood')
    async neighborhood(@Param('id') id: string, @Param('entityId') entityId: string) {
        return this.service.getNeighborhood(id, entityId)
    }
}
