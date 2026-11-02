import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '@xpert-ai/server-core'
import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TenantPermissionGuard, UUIDValidationPipe } from '@xpert-ai/server-core'
import { XpertService } from './xpert.service'

@ApiTags('Xpert')
@ApiBearerAuth()
@UseGuards(TenantPermissionGuard)
@Controller('tag-usage')
@Permissions(AIPermissionsEnum.XPERT_EDIT)
export class XpertTagUsageController {
    constructor(private readonly service: XpertService) {}

    @Get(':tagId')
    getUsage(
        @Param('tagId', UUIDValidationPipe) tagId: string,
        @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number
    ) {
        return this.service.getTagUsage(tagId, skip)
    }
}
