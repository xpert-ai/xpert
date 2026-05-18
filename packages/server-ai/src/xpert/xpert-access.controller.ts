import type { IXpert } from '@xpert-ai/contracts'
import { TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PublishedXpertAccessService } from './published-xpert-access.service'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('accessible')
export class XpertAccessController {
    constructor(private readonly publishedXpertAccessService: PublishedXpertAccessService) {}

    @Get(':id')
    async getAccessiblePublishedXpert(@Param('id') id: string): Promise<Pick<IXpert, 'id'>> {
        const xpert = await this.publishedXpertAccessService.getAccessiblePublishedXpert(id)
        return {
            id: xpert.id
        }
    }
}
