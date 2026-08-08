import { AIPermissionsEnum, IMembershipUsageQuery } from '@xpert-ai/contracts'
import {
    PaginationParams,
    PermissionGuard,
    Permissions,
    TransformInterceptor,
    UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    CreateMembershipPlanDto,
    MembershipAdminUsersQueryDto,
    MembershipAssignDto,
    MembershipBulkActionDto,
    MembershipPlanReassignDto,
    MembershipPointAdjustDto,
    UpdateMembershipPlanDto
} from './dto/membership.dto'
import { MembershipService } from './membership.service'

@ApiTags('Membership')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class MembershipController {
    constructor(private readonly service: MembershipService) {}

    @Get('me')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
    async getMe() {
        return this.service.getMe()
    }

    @Get('me/overview')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
    async getOverview(@Query() query: IMembershipUsageQuery) {
        return this.service.getOverview(query)
    }

    @Get('me/periods')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
    async getPeriods() {
        return this.service.findMyPeriods()
    }

    @Get('me/usage')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
    async getUsage(
        @Query() query: IMembershipUsageQuery,
        @Query('$take') take: PaginationParams<unknown>['take'],
        @Query('$skip') skip: PaginationParams<unknown>['skip']
    ) {
        return this.service.findMyUsage(query, { take, skip })
    }

    @Get('me/usage-summary')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
    async getUsageSummary(
        @Query() query: IMembershipUsageQuery,
        @Query('$take') take: PaginationParams<unknown>['take'],
        @Query('$skip') skip: PaginationParams<unknown>['skip']
    ) {
        return this.service.findMyUsageSummaries(query, { take, skip })
    }

    @Post('me/details')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_USE)
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
    async createPlan(@Body() input: CreateMembershipPlanDto) {
        return this.service.createPlan(input)
    }

    @Patch('plans/:id')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async updatePlan(@Param('id') id: string, @Body() input: UpdateMembershipPlanDto) {
        return this.service.updatePlan(id, input)
    }

    @Post('plans/:id/reassign')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async reassignPlan(@Param('id') id: string, @Body() input: MembershipPlanReassignDto) {
        return this.service.reassignPlanMembers(id, input)
    }

    @Post('plans/:id/archive')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async archivePlan(@Param('id') id: string) {
        return this.service.archivePlan(id)
    }

    @Delete('plans/:id')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async deletePlan(@Param('id') id: string) {
        return this.service.deletePlan(id)
    }

    @Get('admin/users')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getAdminUsers(
        @Query('userId') userId?: string,
        @Query('planId') planId?: string,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminUsers({ userId, planId, take, skip })
    }

    @Get('admin/users/:userId/scope-memberships')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getAdminUserScopeMemberships(@Param('userId') userId: string) {
        return this.service.findAdminUserScopeMemberships(userId)
    }

    @Get('admin/members')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async getAdminMembers(
        @Query() query: MembershipAdminUsersQueryDto,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminMembers({ ...query, take, skip })
    }

    @Post('admin/users/bulk')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async applyBulkUserAction(@Body() input: MembershipBulkActionDto) {
        return this.service.applyBulkUserAction(input)
    }

    @Post('admin/users/:userId/assign')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async assignUser(@Param('userId') userId: string, @Body() input: MembershipAssignDto) {
        return this.service.assignUser(userId, input)
    }

    @Post('admin/users/:userId/adjust-points')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async adjustUserPoints(@Param('userId') userId: string, @Body() input: MembershipPointAdjustDto) {
        return this.service.adjustUserPoints(userId, input)
    }

    @Get('admin/users/:userId/personal-points')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getPersonalPoints(@Param('userId') userId: string) {
        return this.service.getPersonalPoints(userId)
    }

    @Get('admin/users/:userId/audit')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getAdminUserAudit(
        @Param('userId') userId: string,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminUserAudit(userId, { take, skip })
    }

    @Get('admin/users/:userId/periods')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async getAdminUserPeriods(@Param('userId') userId: string) {
        return this.service.findAdminUserPeriods(userId)
    }

    @Post('admin/users/:userId/periods/:periodId/cancel')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async cancelAdminUserPeriod(@Param('userId') userId: string, @Param('periodId') periodId: string) {
        return this.service.cancelAdminUserPeriod(userId, periodId)
    }

    @Post('admin/users/:userId/adjust-personal-points')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    @UseValidationPipe()
    async adjustPersonalPoints(@Param('userId') userId: string, @Body() input: MembershipPointAdjustDto) {
        return this.service.adjustPersonalPoints(userId, input)
    }

    @Post('admin/users/:userId/renew')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async renewUser(@Param('userId') userId: string) {
        return this.service.renewUser(userId)
    }

    @Post('admin/users/:userId/pause')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async pauseUser(@Param('userId') userId: string) {
        return this.service.pauseUser(userId)
    }

    @Post('admin/users/:userId/resume')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async resumeUser(@Param('userId') userId: string) {
        return this.service.resumeUser(userId)
    }

    @Post('admin/users/:userId/revoke')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MEMBERSHIP_EDIT)
    async revokeUser(@Param('userId') userId: string) {
        return this.service.revokeUser(userId)
    }
}
