import { Controller, Get, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { XpertMobileBootstrap, XpertMobileXpertsResponse } from '@xpert-ai/contracts'
import { MobileService } from './mobile.service'

@ApiTags('Mobile')
@ApiBearerAuth()
@Controller()
export class MobileController {
    constructor(private readonly mobileService: MobileService) {}

    @Get('bootstrap')
    async bootstrap(): Promise<XpertMobileBootstrap> {
        return this.mobileService.getBootstrap()
    }

    @Get('xperts')
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'offset', required: false })
    async xperts(
        @Query('search') search?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string
    ): Promise<XpertMobileXpertsResponse> {
        return this.mobileService.listXperts({
            search,
            limit,
            offset
        })
    }
}
