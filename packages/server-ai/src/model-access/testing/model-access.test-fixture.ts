import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FeatureOrganization, Organization, User } from '@xpert-ai/server-core'
import { DataSource, Repository } from 'typeorm'
import { AIProvidersService } from '../../ai-model'
import { CopilotProviderModel } from '../../copilot-provider/models/copilot-provider-model.entity'
import { Copilot } from '../../copilot/copilot.entity'
import { MembershipService } from '../../membership/membership.service'
import { ModelGatewayPublication } from '../../model-gateway/model-gateway-publication.entity'
import { ModelAccessEvent } from '../model-access-event.entity'
import { ModelAccessRequest } from '../model-access-request.entity'
import { UserModelGrant } from '../user-model-grant.entity'

import { ModelAccessCatalogService } from '../catalog/model-access-catalog.service'
import { ModelAccessGatewayService } from '../gateway/model-access-gateway.service'
import { ModelAccessLifecycleService } from '../lifecycle/model-access-lifecycle.service'
import { ModelAccessPolicyService } from '../policy/model-access-policy.service'
import { ModelAccessRecordsService } from '../requests/model-access-records.service'
import { ModelAccessRequestsService } from '../requests/model-access-requests.service'
import { ModelAccessTargetsService } from '../catalog/model-access-targets.service'
import { ModelAccessService } from '../model-access.service'

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
    const automationCommands = { execute: jest.fn().mockResolvedValue(false) }
    const catalog = new ModelAccessCatalogService(
        membershipService,
        userRepository,
        policy,
        lifecycle,
        targets,
        records,
        automationCommands as unknown as CommandBus
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
    return { service, lifecycle, automationCommands }
}
