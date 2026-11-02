import { Test } from '@nestjs/testing'
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm'
import { FeatureOrganization, Organization, TenantSetting, User, UserOrganization } from '@xpert-ai/server-core'
import { Copilot } from '../copilot/copilot.entity'
import { Xpert } from '../xpert/xpert.entity'
import { MembershipBackfillQueueService } from './membership-backfill.queue'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { MembershipModule } from './membership.module'
import { MEMBERSHIP_PROVIDERS } from './membership.providers'
import { MembershipService } from './membership.service'
import { UserMembership } from './user-membership.entity'

it('resolves every membership collaborator through the production provider registrations', async () => {
    expect(Reflect.getMetadata('providers', MembershipModule)).toEqual(expect.arrayContaining(MEMBERSHIP_PROVIDERS))
    expect(Reflect.getMetadata('exports', MembershipModule)).toContain(MembershipService)
    const module = await Test.createTestingModule({
        providers: [
            ...MEMBERSHIP_PROVIDERS,
            ...[
                MembershipPlan,
                UserMembership,
                MembershipPointLedger,
                MembershipPeriod,
                Xpert,
                User,
                UserOrganization,
                Copilot,
                FeatureOrganization,
                TenantSetting,
                Organization
            ].map((entity) => ({ provide: getRepositoryToken(entity), useValue: {} })),
            { provide: getDataSourceToken(), useValue: {} },
            { provide: MembershipBackfillQueueService, useValue: {} }
        ]
    }).compile()
    try {
        for (const provider of MEMBERSHIP_PROVIDERS) expect(module.get(provider)).toBeInstanceOf(provider)
    } finally {
        await module.close()
    }
})
