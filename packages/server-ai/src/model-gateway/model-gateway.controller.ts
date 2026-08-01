import {
    AIPermissionsEnum,
    ModelAccessChannelEnum,
    ModelGatewayApiKeyStatusEnum,
    ModelGatewayCallStatusEnum
} from '@xpert-ai/contracts'
import {
    PaginationParams,
    PermissionGuard,
    Permissions,
    TransformInterceptor,
    UseValidationPipe
} from '@xpert-ai/server-core'
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import {
    ModelGatewayApiKeyCreateDto,
    ModelGatewayApiKeyRevokeDto,
    ModelGatewayExternalRequestCreateDto,
    ModelGatewaySettingsUpdateDto
} from './dto'
import { ModelGatewayService } from './model-gateway.service'
import { ModelAccessService } from '../model-access/model-access.service'
import { ModelAccessRequestWithdrawDto } from '../model-access/dto'

@ApiTags('Model gateway')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller('model-gateway')
export class ModelGatewayController {
    constructor(
        private readonly service: ModelGatewayService,
        private readonly modelAccessService: ModelAccessService
    ) {}

    @Get('catalog')
    getCatalog() {
        return this.modelAccessService.getExternalCatalog()
    }

    @Post('requests')
    @UseValidationPipe()
    createRequest(@Body() input: ModelGatewayExternalRequestCreateDto) {
        return this.modelAccessService.createExternalRequest(input)
    }

    @Get('requests/my')
    getMyRequests() {
        return this.modelAccessService.findMyRequests(ModelAccessChannelEnum.ExternalApi)
    }

    @Post('requests/:id/withdraw')
    @UseValidationPipe()
    withdrawRequest(@Param('id') id: string, @Body() input: ModelAccessRequestWithdrawDto) {
        return this.modelAccessService.withdrawRequest(id, input, ModelAccessChannelEnum.ExternalApi)
    }

    @Get('grants/my')
    getMyGrants() {
        return this.modelAccessService.findMyGrants(ModelAccessChannelEnum.ExternalApi)
    }

    @Get('keys')
    listMyKeys() {
        return this.service.listMyKeys()
    }

    @Post('keys')
    @UseValidationPipe()
    createKey(@Body() input: ModelGatewayApiKeyCreateDto) {
        return this.service.createKey(input.name, input.lifetime)
    }

    @Post('keys/:id/revoke')
    @UseValidationPipe()
    revokeMyKey(@Param('id') id: string, @Body() input: ModelGatewayApiKeyRevokeDto) {
        return this.service.revokeMyKey(id, input.reason)
    }

    @Get('calls/my')
    getMyCalls(
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.listMyCalls(take, skip)
    }

    @Get('admin/settings')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    getSettings() {
        return this.service.getSettings()
    }

    @Put('admin/settings')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    @UseValidationPipe()
    updateSettings(@Body() input: ModelGatewaySettingsUpdateDto) {
        return this.service.updateSettings(input)
    }

    @Get('admin/keys')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    listAdminKeys(
        @Query('search') search?: string,
        @Query('status') status?: ModelGatewayApiKeyStatusEnum,
        @Query('userId') userId?: string,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.listAdminKeys({ search, status, userId, take, skip })
    }

    @Post('admin/keys/:id/revoke')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    @UseValidationPipe()
    revokeAdminKey(@Param('id') id: string, @Body() input: ModelGatewayApiKeyRevokeDto) {
        return this.service.revokeAdminKey(id, input.reason)
    }

    @Get('admin/calls')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    listAdminCalls(
        @Query('search') search?: string,
        @Query('status') status?: ModelGatewayCallStatusEnum,
        @Query('userId') userId?: string,
        @Query('$take') take?: PaginationParams<unknown>['take'],
        @Query('$skip') skip?: PaginationParams<unknown>['skip']
    ) {
        return this.service.listAdminCalls({ search, status, userId, take, skip })
    }

    @Get('admin/calls/:id/body')
    @UseGuards(PermissionGuard)
    @Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
    getAdminCallBody(@Param('id') id: string) {
        return this.service.getAdminCallBody(id)
    }
}
