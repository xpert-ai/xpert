import { ModelAccessCatalogService } from './catalog/model-access-catalog.service'
import { ModelAccessGatewayService } from './gateway/model-access-gateway.service'
import { ModelAccessLifecycleService } from './lifecycle/model-access-lifecycle.service'
import { ModelAccessPolicyService } from './policy/model-access-policy.service'
import { ModelAccessRecordsService } from './requests/model-access-records.service'
import { ModelAccessRequestsService } from './requests/model-access-requests.service'
import { ModelAccessTargetsService } from './catalog/model-access-targets.service'
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
