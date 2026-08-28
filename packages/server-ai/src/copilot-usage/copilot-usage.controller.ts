import {
    AIPermissionsEnum,
    ICopilotUsageGroupKey,
    ICopilotUsageQuery,
    ICopilotUsageOverview,
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

@ApiTags('CopilotUsage')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.MODEL_USAGE_MONITOR)
@Controller()
export class CopilotUsageController {
    constructor(private readonly service: CopilotUsageService) {}

    @Get('ledger/accounts')
    async getLedgerAccounts(
        @Query() query: ModelUsageLedgerQuery,
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        return this.service.findModelUsageAccountPage(query, { take, skip })
    }

    @Get('ledger/models')
    async getLedgerModels(
        @Query() query: ModelUsageLedgerQuery,
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        return this.service.findModelUsageBreakdownPage(query, 'model', { take, skip })
    }

    @Get('ledger/providers')
    async getLedgerProviders(
        @Query() query: ModelUsageLedgerQuery,
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        return this.service.findModelUsageBreakdownPage(query, 'provider', { take, skip })
    }

    @Get('ledger')
    async getLedger(
        @Query() query: ModelUsageLedgerQuery,
        @Query('$take') take?: number,
        @Query('$skip') skip?: number
    ) {
        return this.service.findModelUsagePage(query, { take, skip })
    }

    @Get('ledger/totals')
    async getLedgerTotals(@Query() query: ModelUsageLedgerQuery) {
        return this.service.findModelUsageTotals(query)
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

    @Get('overview')
    @UseValidationPipe()
    async getOverview(@Query() query: ICopilotUsageQuery): Promise<ICopilotUsageOverview> {
        return this.service.findOverview(query)
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
