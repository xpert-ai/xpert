import { FeatureOrganization, Organization, TenantSetting, User, UserOrganization } from '@xpert-ai/server-core'
import { DataSource, Repository } from 'typeorm'
import { Copilot } from '../../copilot/copilot.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { MembershipAccessService } from '../consumption/membership-access.service'
import { MembershipAdminService } from '../members/membership-admin.service'
import { MembershipBackfillQueueService } from '../membership-backfill.queue'
import { MembershipBackfillService } from '../initialization/membership-backfill.service'
import { MembershipBillingService } from '../consumption/membership-billing.service'
import { MembershipInitializationService } from '../initialization/membership-initialization.service'
import { MembershipLifecycleService } from '../periods/membership-lifecycle.service'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPeriodsService } from '../periods/membership-periods.service'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPlansService } from '../plans/membership-plans.service'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import { MembershipRefundsService } from '../periods/membership-refunds.service'
import { MembershipUsageService } from '../consumption/membership-usage.service'
import { MembershipWalletService } from '../consumption/membership-wallet.service'
import { MembershipService } from '../membership.service'
import { UserMembership } from '../user-membership.entity'

const fixtures = new WeakMap<
    MembershipService,
    {
        policy: MembershipPolicyService
        records: MembershipRecordsService
        lifecycle: MembershipLifecycleService
        initialization: MembershipInitializationService
        backfill: MembershipBackfillService
        plans: MembershipPlansService
        admin: MembershipAdminService
        periods: MembershipPeriodsService
        refunds: MembershipRefundsService
        wallet: MembershipWalletService
        access: MembershipAccessService
        usage: MembershipUsageService
        billing: MembershipBillingService
    }
>()

export function getMembershipFixture(service: MembershipService) {
    const fixture = fixtures.get(service)
    if (!fixture) throw new Error('Membership fixture not registered')
    return fixture
}

export function createMembershipFixture(
    dataSource: DataSource,
    planRepository: Repository<MembershipPlan>,
    membershipRepository: Repository<UserMembership>,
    ledgerRepository: Repository<MembershipPointLedger>,
    xpertRepository: Repository<Xpert>,
    userRepository: Repository<User>,
    userOrganizationRepository?: Repository<UserOrganization>,
    copilotRepository?: Repository<Copilot>,
    featureOrganizationRepository?: Repository<FeatureOrganization>,
    tenantSettingRepository?: Repository<TenantSetting>,
    periodRepository?: Repository<MembershipPeriod>,
    organizationRepository?: Repository<Organization>,
    backfillQueueService?: MembershipBackfillQueueService
) {
    const policy = new MembershipPolicyService(
        planRepository,
        userRepository,
        userOrganizationRepository,
        featureOrganizationRepository,
        organizationRepository
    )
    const records = new MembershipRecordsService(
        ledgerRepository,
        planRepository,
        membershipRepository,
        tenantSettingRepository,
        periodRepository
    )
    const lifecycle = new MembershipLifecycleService(
        records,
        policy,
        membershipRepository,
        dataSource,
        periodRepository
    )
    const refunds = new MembershipRefundsService(policy, records, dataSource)
    const wallet = new MembershipWalletService(policy, records, dataSource)
    const initialization = new MembershipInitializationService(
        policy,
        records,
        lifecycle,
        dataSource,
        planRepository,
        userRepository,
        membershipRepository,
        backfillQueueService,
        userOrganizationRepository,
        copilotRepository
    )
    const periods = new MembershipPeriodsService(policy, records, lifecycle, dataSource)
    const backfill = new MembershipBackfillService(
        initialization,
        policy,
        records,
        userRepository,
        dataSource,
        userOrganizationRepository,
        organizationRepository
    )
    const plans = new MembershipPlansService(policy, records, initialization, planRepository, dataSource)
    const admin = new MembershipAdminService(
        policy,
        records,
        lifecycle,
        periods,
        membershipRepository,
        userRepository,
        ledgerRepository,
        dataSource,
        periodRepository
    )
    const access = new MembershipAccessService(
        records,
        policy,
        lifecycle,
        initialization,
        xpertRepository,
        membershipRepository
    )
    const usage = new MembershipUsageService(access, records, ledgerRepository, tenantSettingRepository)
    const billing = new MembershipBillingService(policy, access, records, lifecycle, dataSource, ledgerRepository)
    const service = new MembershipService(
        policy,
        plans,
        initialization,
        admin,
        backfill,
        lifecycle,
        periods,
        refunds,
        wallet,
        usage,
        billing,
        access
    )
    fixtures.set(service, {
        policy,
        records,
        lifecycle,
        initialization,
        backfill,
        plans,
        admin,
        periods,
        refunds,
        wallet,
        access,
        usage,
        billing
    })
    return service
}
