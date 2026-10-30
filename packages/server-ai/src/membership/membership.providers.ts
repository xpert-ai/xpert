import { MembershipAccessService } from './consumption/membership-access.service'
import { MembershipAdminService } from './members/membership-admin.service'
import { MembershipBackfillService } from './initialization/membership-backfill.service'
import { MembershipBillingService } from './consumption/membership-billing.service'
import { MembershipInitializationService } from './initialization/membership-initialization.service'
import { MembershipLifecycleService } from './periods/membership-lifecycle.service'
import { MembershipPeriodsService } from './periods/membership-periods.service'
import { MembershipPlansService } from './plans/membership-plans.service'
import { MembershipPolicyService } from './members/membership-policy.service'
import { MembershipRecordsService } from './members/membership-records.service'
import { MembershipRefundsService } from './periods/membership-refunds.service'
import { MembershipUsageService } from './consumption/membership-usage.service'
import { MembershipWalletService } from './consumption/membership-wallet.service'
import { MembershipService } from './membership.service'

export const MEMBERSHIP_PROVIDERS = [
    MembershipPolicyService,
    MembershipRecordsService,
    MembershipLifecycleService,
    MembershipInitializationService,
    MembershipBackfillService,
    MembershipPlansService,
    MembershipAdminService,
    MembershipPeriodsService,
    MembershipRefundsService,
    MembershipWalletService,
    MembershipAccessService,
    MembershipUsageService,
    MembershipBillingService,
    MembershipService
]
