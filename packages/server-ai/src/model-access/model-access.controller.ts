import { AIPermissionsEnum } from '@xpert-ai/contracts'
import {
    PaginationParams,
    PermissionGuard,
    Permissions,
    TransformInterceptor,
    UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    ModelAccessAdminQueryDto,
    ModelAccessRequestApproveDto,
    ModelAccessRequestCreateDto,
    ModelAccessRequestRejectDto,
    ModelAccessRequestWithdrawDto,
    UserModelGrantExtendDto,
    UserModelGrantRevokeDto
} from './dto'
import { ModelAccessService } from './model-access.service'

@ApiTags('Model access')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ModelAccessController {
    constructor(private readonly service: ModelAccessService) {}

    @Get('catalog')
    async getCatalog() {
        return this.service.getCatalog()
    }

    @Get('requests/my')
    async getMyRequests() {
        return this.service.findMyRequests()
    }

    @Post('requests')
    @UseValidationPipe()
    async createRequest(@Body() input: ModelAccessRequestCreateDto) {
        return this.service.createRequest(input)
    }

    @Post('requests/:id/withdraw')
    @UseValidationPipe()
    async withdrawRequest(@Param('id') id: string, @Body() input: ModelAccessRequestWithdrawDto) {
        return this.service.withdrawRequest(id, input)
    }

    @Get('grants/my')
    async getMyGrants() {
        return this.service.findMyGrants()
    }

    @Get('admin/requests')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW, AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async getAdminRequests(
        @Query() query: ModelAccessAdminQueryDto,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminRequests({ ...query, take, skip })
    }

    @Get('admin/grants')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW, AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async getAdminGrants(
        @Query() query: ModelAccessAdminQueryDto,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminGrants({ ...query, take, skip })
    }

    @Get('admin/events')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_VIEW, AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async getAdminEvents(
        @Query() query: ModelAccessAdminQueryDto,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.findAdminEvents({ ...query, take, skip })
    }

    @Post('admin/requests/:id/approve')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async approveRequest(@Param('id') id: string, @Body() input: ModelAccessRequestApproveDto) {
        return this.service.approveRequest(id, input)
    }

    @Post('admin/requests/:id/reject')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async rejectRequest(@Param('id') id: string, @Body() input: ModelAccessRequestRejectDto) {
        return this.service.rejectRequest(id, input)
    }

    @Post('admin/grants/:id/extend')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async extendGrant(@Param('id') id: string, @Body() input: UserModelGrantExtendDto) {
        return this.service.extendGrant(id, input)
    }

    @Post('admin/grants/:id/revoke')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT)
    @UseValidationPipe()
    async revokeGrant(@Param('id') id: string, @Body() input: UserModelGrantRevokeDto) {
        return this.service.revokeGrant(id, input)
    }
}
