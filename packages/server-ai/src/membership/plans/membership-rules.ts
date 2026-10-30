import { BadRequestException } from '@nestjs/common'
import {
    IMembershipAllowedModel,
    IMembershipModelMultiplier,
    IMembershipPlan,
    IMembershipRateLimit,
    MembershipPlanStatusEnum,
    MembershipSourceEnum
} from '@xpert-ai/contracts'
import { ExceedingLimitException } from '../../core/errors'
import { translateMembershipError } from '../membership-utils'
import { MembershipWithPlan } from '../membership.types'

export function isModelAllowed(
    plan: Pick<IMembershipPlan, 'allowedModels'>,
    provider?: string,
    model?: string,
    copilotId?: string
): boolean {
    const allowedModels = plan.allowedModels ?? []
    if (!allowedModels.length) {
        return true
    }

    const providerName = provider?.trim()
    const modelName = model?.trim()
    if (!providerName || !modelName) {
        return false
    }

    return allowedModels.some(
        (rule) =>
            (rule.provider === '*' || rule.provider === providerName) &&
            (rule.model === '*' || rule.model === modelName) &&
            (!rule.copilotId?.trim() || rule.copilotId.trim() === copilotId?.trim())
    )
}

export function resolveModelMultiplierForPlan(
    plan: Pick<IMembershipPlan, 'modelMultipliers'>,
    provider?: string,
    model?: string
) {
    return resolveModelMultiplier(plan, provider, model)
}

export function resolveModelMultiplier(
    plan: Pick<IMembershipPlan, 'modelMultipliers'>,
    provider?: string,
    model?: string
) {
    const multiplier = (plan.modelMultipliers ?? []).find((item) => {
        const providerMatches = !item.provider || item.provider === provider
        const modelMatches = !item.model || item.model === model || item.model === '*'
        return providerMatches && modelMatches
    })
    return Math.max(0, Number(multiplier?.multiplier ?? 1))
}

export function assertModelAllowed(plan: IMembershipPlan, provider?: string, model?: string, copilotId?: string) {
    if (!isModelAllowed(plan, provider, model, copilotId)) {
        throw new ExceedingLimitException(
            translateMembershipError(
                'server-ai:Error.CopilotModelUnavailableForMembershipPlan',
                'Copilot model is not available for the current membership plan.'
            )
        )
    }
}

export function normalizeAllowedModels(value: unknown): IMembershipAllowedModel[] {
    if (value === undefined || value === null) {
        return []
    }
    if (!Array.isArray(value)) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipAllowedModels',
                'Allowed models must be an array of provider and model pairs.'
            )
        )
    }

    return value.map((item) => {
        const provider =
            typeof item === 'object' && item !== null && 'provider' in item && typeof item.provider === 'string'
                ? item.provider.trim()
                : ''
        const model =
            typeof item === 'object' && item !== null && 'model' in item && typeof item.model === 'string'
                ? item.model.trim()
                : ''
        const copilotId =
            typeof item === 'object' && item !== null && 'copilotId' in item && typeof item.copilotId === 'string'
                ? item.copilotId.trim()
                : undefined
        if (!provider || !model) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.InvalidMembershipAllowedModels',
                    'Allowed models must be an array of provider and model pairs.'
                )
            )
        }
        return copilotId ? { provider, model, copilotId } : { provider, model }
    })
}

export function normalizeModelMultipliers(value: unknown): IMembershipModelMultiplier[] {
    if (value === undefined || value === null) {
        return []
    }
    if (!Array.isArray(value)) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipModelMultipliers',
                'Settlement amount multipliers must be an array of model rules.'
            )
        )
    }

    return value.map((item) => {
        const provider = readOptionalRuleText(item, 'provider')
        const model = readOptionalRuleText(item, 'model')
        const multiplier =
            typeof item === 'object' && item !== null && 'multiplier' in item ? Number(item.multiplier) : NaN
        if (!Number.isFinite(multiplier) || multiplier < 0) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.InvalidMembershipModelMultipliers',
                    'Each settlement amount multiplier must be a non-negative number.'
                )
            )
        }
        return { provider, model, multiplier }
    })
}

export function normalizeRateLimits(value: unknown): IMembershipRateLimit[] {
    if (value === undefined || value === null) {
        return []
    }
    if (!Array.isArray(value)) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipRateLimits',
                'Rate limits must be an array of usage rules.'
            )
        )
    }

    return value.map((item) => {
        const provider = readOptionalRuleText(item, 'provider')
        const model = readOptionalRuleText(item, 'model')
        const period =
            typeof item === 'object' && item !== null && 'period' in item && typeof item.period === 'string'
                ? item.period
                : ''
        const pointLimit =
            typeof item === 'object' && item !== null && 'pointLimit' in item ? Number(item.pointLimit) : NaN
        if (!['hour', 'day', 'week', 'cycle'].includes(period) || !Number.isFinite(pointLimit) || pointLimit <= 0) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.InvalidMembershipRateLimits',
                    'Each rate limit requires a valid period and a positive point limit.'
                )
            )
        }
        return {
            provider,
            model,
            period: period as IMembershipRateLimit['period'],
            pointLimit
        }
    })
}

export function readOptionalRuleText(value: unknown, property: 'provider' | 'model') {
    if (typeof value !== 'object' || value === null || !(property in value)) {
        return null
    }
    const propertyValue = value[property]
    if (propertyValue === undefined || propertyValue === null || propertyValue === '') {
        return null
    }
    if (typeof propertyValue !== 'string') {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipRuleText',
                'Provider and model values must be text.'
            )
        )
    }
    const normalized = propertyValue.trim()
    if (!normalized || normalized.length > 255) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.InvalidMembershipRuleText',
                'Provider and model values must be valid text.'
            )
        )
    }
    return normalized
}

export function assertDefaultPlanIsActive(status: MembershipPlanStatusEnum, isDefault: boolean) {
    if (status === MembershipPlanStatusEnum.Archived && isDefault) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.MembershipArchivedPlanCannotBeDefault',
                'An archived membership plan cannot be the default plan.'
            )
        )
    }
}

export function assertAdminPeriodGrantAllowed(membership: MembershipWithPlan) {
    if (membership.source === MembershipSourceEnum.External || !!membership.plan.catalogSourcePlanId) {
        throw new BadRequestException(
            translateMembershipError(
                'server-ai:Error.MembershipPaidPlanRenewalNotAllowed',
                'Purchased memberships must be renewed through billing.'
            )
        )
    }
}
