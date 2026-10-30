import { QueryBus } from '@nestjs/cqrs'
import { FeatureOrganization, Organization, User } from '@xpert-ai/server-core'
import { DataSource, Repository } from 'typeorm'
import { AIProvidersService } from '../ai-model'
import { CopilotProviderModel } from '../copilot-provider/models/copilot-provider-model.entity'
import { Copilot } from '../copilot/copilot.entity'
import { MembershipService } from '../membership/membership.service'
import { ModelGatewayPublication } from '../model-gateway/model-gateway-publication.entity'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { UserModelGrant } from './user-model-grant.entity'

import { ModelAccessCatalogService } from './model-access-catalog.service'
import { ModelAccessGatewayService } from './model-access-gateway.service'
import { ModelAccessLifecycleService } from './model-access-lifecycle.service'
import { ModelAccessPolicyService } from './model-access-policy.service'
import { ModelAccessRecordsService } from './model-access-records.service'
import { ModelAccessRequestsService } from './model-access-requests.service'
import { ModelAccessTargetsService } from './model-access-targets.service'
import { ModelAccessService } from './model-access.service'

export function createModelAccessFixture(
    dataSource: DataSource,
    requestRepository: Repository<ModelAccessRequest>,
    grantRepository: Repository<UserModelGrant>,
    eventRepository: Repository<ModelAccessEvent>,
    publicationRepository: Repository<ModelGatewayPublication>,
    copilotRepository: Repository<Copilot>,
    providerModelRepository: Repository<CopilotProviderModel>,
    userRepository: Repository<User>,
    organizationRepository: Repository<Organization>,
    featureOrganizationRepository: Repository<FeatureOrganization>,
    queryBus: QueryBus,
    providersService: AIProvidersService,
    membershipService: MembershipService
) {
    const targets = new ModelAccessTargetsService(
        queryBus,
        copilotRepository,
        providerModelRepository,
        providersService,
        publicationRepository
    )
    const records = new ModelAccessRecordsService(grantRepository, requestRepository, eventRepository)
    const policy = new ModelAccessPolicyService(
        membershipService,
        userRepository,
        featureOrganizationRepository,
        organizationRepository,
        targets
    )
    const lifecycle = new ModelAccessLifecycleService(
        dataSource,
        grantRepository,
        requestRepository,
        membershipService,
        records,
        targets,
        policy
    )
    const requests = new ModelAccessRequestsService(
        membershipService,
        dataSource,
        requestRepository,
        grantRepository,
        eventRepository,
        policy,
        targets,
        lifecycle,
        records
    )
    const catalog = new ModelAccessCatalogService(
        membershipService,
        userRepository,
        policy,
        lifecycle,
        targets,
        records
    )
    const gateway = new ModelAccessGatewayService(
        membershipService,
        dataSource,
        publicationRepository,
        policy,
        lifecycle,
        targets,
        records,
        requests
    )
    const service = new ModelAccessService(catalog, gateway, requests, lifecycle, targets, policy)
    return { service, lifecycle }
}
