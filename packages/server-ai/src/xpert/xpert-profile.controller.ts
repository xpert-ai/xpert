import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TransformInterceptor } from '@xpert-ai/server-core'
import type { XpertAssistantProfile } from '@xpert-ai/contracts'
import { PublishedXpertAccessService } from './published-xpert-access.service'
import { XpertProfileIndicatorsService } from './xpert-profile-indicators.service'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class XpertProfileController {
    constructor(
        private readonly access: PublishedXpertAccessService,
        private readonly indicators: XpertProfileIndicatorsService
    ) {}

    @Get(':id/profile')
    async getProfile(@Param('id') id: string): Promise<XpertAssistantProfile> {
        const xpert = await this.access.getAccessiblePublishedXpert(id, {
            relations: ['tags', 'workspace', 'createdBy', 'agent']
        })
        const indicators = await this.indicators.getIndicators(xpert)
        // Construct a whitelist instead of serializing the entity and its loaded relations.
        return {
            id: xpert.id,
            name: xpert.name,
            title: xpert.title,
            titleCN: xpert.titleCN,
            description: xpert.description,
            avatar: xpert.avatar,
            version: xpert.version,
            tags: (xpert.tags ?? []).map(({ id, name, color }) => ({ id, name, color })),
            workspace: xpert.workspace ? { id: xpert.workspace.id, name: xpert.workspace.name } : null,
            // The entity records a creator, not a separate publisher identity.
            creator: xpert.createdBy
                ? {
                      id: xpert.createdBy.id,
                      name:
                          [xpert.createdBy.firstName, xpert.createdBy.lastName].filter(Boolean).join(' ') ||
                          xpert.createdBy.username
                  }
                : null,
            publishedAt: xpert.publishAt,
            createdAt: xpert.createdAt,
            updatedAt: xpert.updatedAt,
            indicators
        }
    }
}
