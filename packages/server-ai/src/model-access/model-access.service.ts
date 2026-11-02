import { Injectable } from '@nestjs/common'
import {
    AiModelTypeEnum,
    IModelAccessAdminQuery,
    IModelAccessCatalog,
    IModelAccessRequest,
    IModelAccessResolution,
    IModelGatewayCatalog,
    IUserModelGrant,
    ModelAccessChannelEnum,
    TModelAccessRequestApproveInput,
    TModelAccessRequestCreateInput,
    TModelAccessRequestRejectInput,
    TModelAccessRequestWithdrawInput,
    TModelGatewayExternalRequestCreateInput,
    TUserModelGrantExtendInput,
    TUserModelGrantRevokeInput
} from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { Copilot } from '../copilot/copilot.entity'
import {
    CatalogModelAccessBatchInput,
    CatalogModelLabel,
    ModelAccessLifecycleBatchInput,
    ModelAccessLifecycleBatchResult,
    ResolveModelInput
} from './model-access.types'

import { ModelAccessCatalogService } from './catalog/model-access-catalog.service'
import { ModelAccessGatewayService } from './gateway/model-access-gateway.service'
import { ModelAccessLifecycleService } from './lifecycle/model-access-lifecycle.service'
import { ModelAccessPolicyService } from './policy/model-access-policy.service'
import { ModelAccessRequestsService } from './requests/model-access-requests.service'
import { ModelAccessTargetsService } from './catalog/model-access-targets.service'
export type {
    CatalogModelAccessBatchInput,
    CatalogModelLabel,
    ModelAccessLifecycleBatchInput,
    ModelAccessLifecycleBatchResult
} from './model-access.types'
export { modelAccessEndOfDay } from './model-access.utils'

@Injectable()
export class ModelAccessService {
    constructor(
        private readonly catalog: ModelAccessCatalogService,
        private readonly gateway: ModelAccessGatewayService,
        private readonly requests: ModelAccessRequestsService,
        private readonly lifecycle: ModelAccessLifecycleService,
        private readonly targets: ModelAccessTargetsService,
        private readonly policy: ModelAccessPolicyService
    ) {}

    async getCatalog(): Promise<IModelAccessCatalog> {
        return this.catalog.getCatalog()
    }

    async getExternalCatalog(): Promise<IModelGatewayCatalog> {
        return this.gateway.getExternalCatalog()
    }

    async createExternalRequest(
        input: TModelGatewayExternalRequestCreateInput
    ): Promise<IModelAccessRequest | IUserModelGrant> {
        return this.gateway.createExternalRequest(input)
    }

    async resolveExternalModelAccess(input: {
        tenantId: string
        organizationId: string | null
        userId: string
        publicationId: string
    }): Promise<IModelAccessResolution> {
        return this.gateway.resolveExternalModelAccess(input)
    }

    async createRequest(input: TModelAccessRequestCreateInput): Promise<IModelAccessRequest> {
        return this.requests.createRequest(input)
    }

    async findMyRequests(channel = ModelAccessChannelEnum.Xpert): Promise<IModelAccessRequest[]> {
        return this.requests.findMyRequests(channel)
    }

    async withdrawRequest(
        id: string,
        input?: TModelAccessRequestWithdrawInput,
        channel = ModelAccessChannelEnum.Xpert
    ): Promise<IModelAccessRequest> {
        return this.requests.withdrawRequest(id, input, channel)
    }

    async findMyGrants(channel = ModelAccessChannelEnum.Xpert): Promise<IUserModelGrant[]> {
        return this.requests.findMyGrants(channel)
    }

    async findAdminRequests(query: IModelAccessAdminQuery = {}) {
        return this.requests.findAdminRequests(query)
    }

    async findAdminGrants(query: IModelAccessAdminQuery = {}) {
        return this.requests.findAdminGrants(query)
    }

    async findAdminEvents(query: IModelAccessAdminQuery = {}) {
        return this.requests.findAdminEvents(query)
    }

    async approveRequest(id: string, input: TModelAccessRequestApproveInput): Promise<IUserModelGrant | null> {
        return this.requests.approveRequest(id, input)
    }

    async rejectRequest(id: string, input: TModelAccessRequestRejectInput): Promise<IModelAccessRequest> {
        return this.requests.rejectRequest(id, input)
    }

    async extendGrant(id: string, input: TUserModelGrantExtendInput): Promise<IUserModelGrant> {
        return this.requests.extendGrant(id, input)
    }

    async revokeGrant(id: string, input: TUserModelGrantRevokeInput): Promise<IUserModelGrant> {
        return this.requests.revokeGrant(id, input)
    }

    async resolveModelAccess(input: ResolveModelInput): Promise<IModelAccessResolution> {
        return this.catalog.resolveModelAccess(input)
    }

    async canUseCatalogModels(input: CatalogModelAccessBatchInput): Promise<boolean[]> {
        return this.catalog.canUseCatalogModels(input)
    }

    async getCatalogModelLabels(input: CatalogModelAccessBatchInput): Promise<Array<CatalogModelLabel | null>> {
        return this.catalog.getCatalogModelLabels(input)
    }

    async assertCanUseModel(input: ResolveModelInput): Promise<IModelAccessResolution> {
        return this.catalog.assertCanUseModel(input)
    }

    async canUseCatalogModel(input: ResolveModelInput): Promise<boolean> {
        return this.catalog.canUseCatalogModel(input)
    }

    async processDueGrants(filter: {
        tenantId: string
        organizationId?: string | null
        userId?: string
        copilotId?: string
        copilotModelId?: string
        modelType?: AiModelTypeEnum
    }): Promise<number> {
        return this.lifecycle.processDueGrants(filter)
    }

    async processAllDueGrants(): Promise<number> {
        return this.lifecycle.processAllDueGrants()
    }

    async reconcileLifecycleBatch(
        input: ModelAccessLifecycleBatchInput = {}
    ): Promise<ModelAccessLifecycleBatchResult> {
        return this.lifecycle.reconcileLifecycleBatch(input)
    }

    async closeOrganizationAccessForRemovedUser(input: {
        tenantId: string
        organizationId: string
        userId: string
    }): Promise<void> {
        return this.lifecycle.closeOrganizationAccessForRemovedUser(input)
    }

    async handleCopilotStateChanged(copilot: Pick<Copilot, 'id' | 'tenantId' | 'enabled'>): Promise<void> {
        return this.lifecycle.handleCopilotStateChanged(copilot)
    }

    async handleConfiguredModelDeleted(input: {
        tenantId: string
        copilotId: string
        copilotModelId: string
        modelType: AiModelTypeEnum
    }): Promise<void> {
        return this.lifecycle.handleConfiguredModelDeleted(input)
    }

    async hasOrganizationModelCredentials(
        input: Pick<ResolveModelInput, 'tenantId' | 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
    ): Promise<boolean> {
        return this.targets.hasOrganizationModelCredentials(input)
    }

    async hasConfiguredOrganizationModels(tenantId: string, organizationId: string): Promise<boolean> {
        return this.targets.hasConfiguredOrganizationModels(tenantId, organizationId)
    }

    async isModelGatewayFeatureEnabled(
        scope: string | { tenantId: string; organizationId: string | null },
        manager?: EntityManager
    ) {
        return this.policy.isModelGatewayFeatureEnabled(scope, manager)
    }
}
