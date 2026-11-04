import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { FeatureOrganization, Organization, User } from '@xpert-ai/server-core'
import { AIProvidersService } from '../ai-model'
import { Copilot } from '../copilot/copilot.entity'
import { CopilotProviderModel } from '../copilot-provider/models/copilot-provider-model.entity'
import { MembershipService } from '../membership/membership.service'
import { ModelGatewayPublication } from '../model-gateway/model-gateway-publication.entity'
import { ModelAccessEvent } from './model-access-event.entity'
import { ModelAccessRequest } from './model-access-request.entity'
import { ModelAccessSchedulerService } from './lifecycle/model-access-scheduler.service'
import { ModelAccessModule } from './model-access.module'
import { MODEL_ACCESS_PROVIDERS } from './model-access.providers'
import { ModelAccessService } from './model-access.service'
import { UserModelGrant } from './user-model-grant.entity'

it('resolves the production model-access provider graph with explicit dependencies', async () => {
    const providers = Reflect.getMetadata('providers', ModelAccessModule)
    expect(providers).toEqual([...MODEL_ACCESS_PROVIDERS, ModelAccessSchedulerService])
    const module = await Test.createTestingModule({
        providers: [
            ...MODEL_ACCESS_PROVIDERS,
            ...[
                ModelAccessRequest,
                UserModelGrant,
                ModelAccessEvent,
                ModelGatewayPublication,
                Copilot,
                CopilotProviderModel,
                User,
                Organization,
                FeatureOrganization
            ].map((entity) => ({
                provide: getRepositoryToken(entity),
                useValue: {}
            })),
            ...[getDataSourceToken(), QueryBus, CommandBus, AIProvidersService, MembershipService].map((provide) => ({
                provide,
                useValue: {}
            }))
        ]
    }).compile()
    try {
        for (const provider of MODEL_ACCESS_PROVIDERS) expect(module.get(provider)).toBeInstanceOf(provider)
        expect(Reflect.getMetadata('exports', ModelAccessModule)).toContain(ModelAccessService)
    } finally {
        await module.close()
    }
})
