import { ModelAccessCatalogService } from './model-access-catalog.service'
import { ModelAccessGatewayService } from './model-access-gateway.service'
import { ModelAccessLifecycleService } from './model-access-lifecycle.service'
import { ModelAccessPolicyService } from './model-access-policy.service'
import { ModelAccessRecordsService } from './model-access-records.service'
import { ModelAccessRequestsService } from './model-access-requests.service'
import { ModelAccessTargetsService } from './model-access-targets.service'
import { ModelAccessService } from './model-access.service'

export const MODEL_ACCESS_PROVIDERS = [
    ModelAccessTargetsService,
    ModelAccessPolicyService,
    ModelAccessRecordsService,
    ModelAccessLifecycleService,
    ModelAccessRequestsService,
    ModelAccessCatalogService,
    ModelAccessGatewayService,
    ModelAccessService
]
