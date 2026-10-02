import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { PermissionGuard, Permissions } from '@xpert-ai/server-core'
import { requireTenantScope } from '../model-gateway/model-gateway.support'
import { ModelExecutionPolicyService } from './execution-policy'

@Controller('model-execution/admin')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
export class ModelExecutionAdminController {
    constructor(private readonly policy: ModelExecutionPolicyService) {}
    @Get('policy')
    getPolicy() {
        return this.policy.get(requireTenantScope())
    }

    @Put('policy')
    setPolicy(@Body() body: unknown) {
        return this.policy.set(requireTenantScope(), body)
    }
}
