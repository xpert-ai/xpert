import {
    AIPermissionsEnum,
    ICopilotUsageGroupKey,
    ICopilotUsageQuery,
    ICopilotUsageSummary,
    ICopilotUsageTotals,
    ModelUsageLedgerQuery,
    IPagination,
    TCopilotQuotaAdjustInput,
    TCopilotQuotaRenewInput
} from '@xpert-ai/contracts'
import {
    PaginationParams,
    ParseJsonPipe,
    PermissionGuard,
    Permissions,
    TransformInterceptor,
    UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotUser } from '../copilot-user/copilot-user.entity'
import { CopilotUsageService } from './copilot-usage.service'
import { ModelUsageLedgerService } from '../model-usage'

@ApiTags('CopilotUsage')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.COPILOT_EDIT)
@Controller()
export class CopilotUsageController {
    constructor(
        private readonly service: CopilotUsageService,
        private readonly modelUsageLedger: ModelUsageLedgerService
    ) {}

    @Get('ledger')
    async getLedger(
        @Query() query: ModelUsageLedgerQuery,
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        return this.modelUsageLedger.findPage(query, { take, skip })
    }

    @Get('ledger/totals')
    async getLedgerTotals(@Query() query: ModelUsageLedgerQuery) {
        return this.modelUsageLedger.totals(query)
    }

    @Get('summary')
    @UseValidationPipe()
    async getSummary(
        @Query() query: ICopilotUsageQuery,
        @Query('$order', ParseJsonPipe) order: PaginationParams<CopilotUser>['order'],
        @Query('$take') take: PaginationParams<CopilotUser>['take'],
        @Query('$skip') skip: PaginationParams<CopilotUser>['skip']
    ): Promise<IPagination<ICopilotUsageSummary>> {
        return this.service.findSummaries(query, { order, take, skip })
    }

    @Get('totals')
    @UseValidationPipe()
    async getTotals(@Query() query: ICopilotUsageQuery): Promise<ICopilotUsageTotals[]> {
        return this.service.findTotals(query)
    }

    @Post('details')
    async getDetails(@Body() groupKey: ICopilotUsageGroupKey) {
        return this.service.findDetails(groupKey)
    }

    @Post('quota/adjust')
    async adjustQuota(@Body() input: TCopilotQuotaAdjustInput) {
        return this.service.adjustQuota(input)
    }

    @Post('quota/renew')
    async renewQuota(@Body() input: TCopilotQuotaRenewInput) {
        return this.service.renewQuota(input)
    }

    @Post('repair-organization-usage')
    async repairOrganizationUsage() {
        return this.service.repairOrganizationUsage()
    }
}
