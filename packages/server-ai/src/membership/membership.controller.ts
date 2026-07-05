import {
    AIPermissionsEnum,
    IMembershipUsageQuery,
    TMembershipAssignInput,
    TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import {
    PaginationParams,
    PermissionGuard,
    Permissions,
    TransformInterceptor,
    UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipService } from './membership.service'

@ApiTags('Membership')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class MembershipController {
    constructor(private readonly service: MembershipService) {}

    @Get('me')
    async getMe() {
        return this.service.getMe()
    }

    @Get('me/overview')
    async getOverview(@Query() query: IMembershipUsageQuery) {
        return this.service.getOverview(query)
    }

    @Get('me/usage')
    async getUsage(
        @Query() query: IMembershipUsageQuery,
        @Query('$take') take: PaginationParams<unknown>['take'],
        @Query('$skip') skip: PaginationParams<unknown>['skip']
    ) {
        return this.service.findMyUsage(query, { take, skip })
    }

    @Get('me/usage-summary')
    async getUsageSummary(
        @Query() query: IMembershipUsageQuery,
        @Query('$take') take: PaginationParams<unknown>['take'],
        @Query('$skip') skip: PaginationParams<unknown>['skip']
    ) {
        return this.service.findMyUsageSummaries(query, { take, skip })
    }

    @Post('me/details')
    async getDetails(@Body() query: IMembershipUsageQuery) {
        return this.service.findMyUsage(query, { take: 200, skip: 0 })
    }

    @Get('scope/status')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getScopeStatus() {
        return this.service.getScopeStatus()
    }

    @Post('scope/initialize')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async initializeScope() {
        return this.service.ensureScopeInitialized()
    }

    @Get('plans')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getPlans() {
        return this.service.findPlans()
    }

    @Post('plans')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async createPlan(@Body() input: Partial<MembershipPlan>) {
        return this.service.createPlan(input)
    }

    @Patch('plans/:id')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async updatePlan(@Param('id') id: string, @Body() input: Partial<MembershipPlan>) {
        return this.service.updatePlan(id, input)
    }

    @Post('plans/:id/archive')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async archivePlan(@Param('id') id: string) {
        return this.service.archivePlan(id)
    }

    @Get('admin/users')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getAdminUsers(
        @Query('userId') userId?: string,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminUsers({ userId, take, skip })
    }

    @Post('admin/users/:userId/assign')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async assignUser(@Param('userId') userId: string, @Body() input: TMembershipAssignInput) {
        return this.service.assignUser(userId, input)
    }

    @Post('admin/users/:userId/adjust-points')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async adjustUserPoints(@Param('userId') userId: string, @Body() input: TMembershipPointAdjustInput) {
        return this.service.adjustUserPoints(userId, input)
    }

    @Post('admin/users/:userId/renew')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async renewUser(@Param('userId') userId: string) {
        return this.service.renewUser(userId)
    }
}
