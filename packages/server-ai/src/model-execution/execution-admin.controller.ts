import { ModelExecutionReconciliationService } from './execution-reconciliation.service'
import { executionError } from './execution-errors'
import { Body, Controller, Get, Put, Post, Param, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { PermissionGuard, Permissions, ZodValidationPipe } from '@xpert-ai/server-core'
import { requireTenantScope } from '../model-gateway/model-gateway.support'
import { ModelExecutionPolicyService } from './execution-policy'
import { ExecutionPendingQuery, executionPendingQuerySchema } from './execution-admin.schema'
import { ExecutionPolicyInput, executionPolicySchema } from './execution-policy.schema'
import { ExecutionReconciliationInput, executionReconciliationSchema } from './execution-reconciliation.schema'

@Controller('model-execution/admin')
@UseGuards(PermissionGuard)
@Permissions(AIPermissionsEnum.MODEL_GATEWAY_MANAGE)
export class ModelExecutionAdminController {
    constructor(
        private readonly policy: ModelExecutionPolicyService,
        private readonly reconciliation: ModelExecutionReconciliationService
    ) {}
    @Get('pending')
    pending(
        @Query(new ZodValidationPipe(executionPendingQuerySchema, () => executionError('Invalid')))
        query: ExecutionPendingQuery
    ) {
        return this.reconciliation.pending(this.reviewerTenant(), query.take, query.skip)
    }
    @Post('calls/:id/reconcile')
    reconcile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(executionReconciliationSchema, () => executionError('Invalid')))
        body: ExecutionReconciliationInput
    ) {
        return this.reconciliation.reconcile(this.reviewerTenant(), id, body)
    }
    @Post('calls/:id/retry-delivery')
    retry(@Param('id', ParseUUIDPipe) id: string) {
        return this.reconciliation.retryDelivery(this.reviewerTenant(), id)
    }
    @Get('policy')
    getPolicy() {
        return this.policy.get(requireTenantScope())
    }

    @Put('policy')
    setPolicy(
        @Body(new ZodValidationPipe(executionPolicySchema, () => executionError('Invalid')))
        body: ExecutionPolicyInput
    ) {
        return this.policy.set(requireTenantScope(), body)
    }

    private reviewerTenant() {
        if (!RequestContext.currentUserId() || RequestContext.currentApiPrincipal()) throw executionError('Denied')
        return requireTenantScope()
    }
}
