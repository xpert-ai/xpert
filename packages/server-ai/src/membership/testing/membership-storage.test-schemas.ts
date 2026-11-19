import { EntitySchema } from 'typeorm'
import { MembershipPlan } from '../membership-plan.entity'
import { MembershipPeriod } from '../membership-period.entity'
import { UserMembership } from '../user-membership.entity'

const uuid = { type: 'uuid' as const }
const scope = {
    id: { ...uuid, primary: true, generated: 'uuid' as const },
    tenantId: uuid,
    organizationId: { ...uuid, nullable: true }
}
const periodBounds = { periodStart: { type: 'timestamptz' as const }, periodEnd: { type: 'timestamptz' as const } }
/** Minimal relational schemas for storage-admission PostgreSQL tests. */
export const membershipStorageTestSchemas = [
    new EntitySchema<MembershipPlan>({
        name: MembershipPlan.name,
        target: MembershipPlan,
        tableName: 'membership_plan',
        columns: {
            ...scope,
            includedStorageBytes: {
                type: 'bigint',
                nullable: true,
                transformer: {
                    to: (value: number | null) => value,
                    from: (value: string | null) => (value == null ? null : Number(value))
                }
            }
        }
    }),
    new EntitySchema<UserMembership>({
        name: UserMembership.name,
        target: UserMembership,
        tableName: 'user_membership',
        columns: {
            ...scope,
            userId: uuid,
            planId: uuid,
            status: { type: 'varchar' },
            updatedAt: { type: 'timestamptz', default: () => 'now()' },
            currentPeriodStart: periodBounds.periodStart,
            currentPeriodEnd: periodBounds.periodEnd,
            planSnapshot: { type: 'jsonb', nullable: true }
        },
        relations: { plan: { type: 'many-to-one', target: MembershipPlan.name, joinColumn: { name: 'planId' } } }
    }),
    new EntitySchema<MembershipPeriod>({
        name: MembershipPeriod.name,
        target: MembershipPeriod,
        tableName: 'user_membership_period',
        columns: {
            ...scope,
            ...periodBounds,
            userId: uuid,
            membershipId: uuid,
            status: { type: 'varchar' },
            planSnapshot: { type: 'jsonb' }
        }
    })
]
