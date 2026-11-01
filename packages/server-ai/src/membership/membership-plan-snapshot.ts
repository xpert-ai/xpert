import { IMembershipPlan, IMembershipPlanSnapshot } from '@xpert-ai/contracts'

export function createMembershipPlanSnapshot(plan: IMembershipPlan): IMembershipPlanSnapshot {
    return {
        planId: plan.id, code: plan.code, name: plan.name, description: plan.description ?? null,
        level: plan.level, catalogSourcePlanId: plan.catalogSourcePlanId ?? null,
        period: plan.period, includedPoints: plan.includedPoints,
        allowedModels: plan.allowedModels?.map((rule) => ({ ...rule })),
        modelMultipliers: plan.modelMultipliers?.map((rule) => ({ ...rule })),
        rateLimits: plan.rateLimits?.map((rule) => ({ ...rule }))
    }
}
