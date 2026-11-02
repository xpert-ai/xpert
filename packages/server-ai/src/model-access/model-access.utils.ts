import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
    AIPermissionsEnum,
    IModelAccessAdminQuery,
    IModelAccessModelSnapshot,
    IUser,
    ModelAccessOwnershipScopeEnum,
    ModelAccessRequestStatusEnum
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { Brackets } from 'typeorm'
import { endOfDayInTimeZone } from '../shared/utils'
import { ModelAccessRequest } from './model-access-request.entity'
import { ModelTarget } from './model-access.types'
import { UserModelGrant } from './user-model-grant.entity'

export const MAX_PAGE_SIZE = 200
export const modelAccessEndOfDay = endOfDayInTimeZone

export function applyAdminFilters(
    qb: {
        andWhere: (where: string | Brackets, parameters?: Record<string, unknown>) => unknown
    },
    alias: 'request' | 'grant',
    query: IModelAccessAdminQuery,
    expiresBefore?: Date
) {
    if (query.search?.trim()) {
        qb.andWhere(
            new Brackets((searchQb) => {
                searchQb
                    .where(`LOWER(${alias}.${alias === 'request' ? 'requesterName' : 'userName'}) LIKE :search`)
                    .orWhere(`LOWER(${alias}.provider) LIKE :search`)
                    .orWhere(`LOWER(${alias}.model) LIKE :search`)
            }),
            { search: `%${query.search.trim().toLowerCase()}%` }
        )
    }
    if (query.channel) {
        qb.andWhere(`${alias}.channel = :channel`, { channel: query.channel })
    }
    if (query.modelType) {
        qb.andWhere(`${alias}.modelType = :modelType`, { modelType: query.modelType })
    }
    if (query.status) {
        qb.andWhere(`${alias}.status = :status`, { status: query.status })
    }
    if (alias === 'grant' && expiresBefore) {
        qb.andWhere('grant.validUntil IS NOT NULL')
        qb.andWhere('grant.validUntil <= :expiresBefore', { expiresBefore })
    }
}

export function applyScopeFilter<T extends { andWhere: (where: string, parameters?: Record<string, unknown>) => T }>(
    qb: T,
    field: string,
    organizationId: string | null
) {
    return organizationId
        ? qb.andWhere(`${field} = :scopeOrganizationId`, { scopeOrganizationId: organizationId })
        : qb.andWhere(`${field} IS NULL`)
}

export function sameModelTarget(
    item: Pick<ModelAccessRequest | UserModelGrant, 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>,
    target: Pick<ModelTarget, 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>
) {
    return (
        (item.organizationId ?? null) === target.organizationId &&
        item.copilotId === target.copilotId &&
        item.copilotModelId === target.copilotModelId &&
        item.modelType === target.modelType
    )
}

export function modelKey(target: Pick<ModelTarget, 'organizationId' | 'copilotId' | 'copilotModelId' | 'modelType'>) {
    return `${target.organizationId ?? 'tenant'}:${target.copilotId}:${target.modelType}:${target.copilotModelId}`
}

export function snapshotModelTarget(target: ModelTarget): IModelAccessModelSnapshot {
    return {
        copilotId: target.copilotId,
        copilotName: target.copilotName,
        copilotOrganizationId: target.organizationId,
        provider: target.provider,
        providerLabel: target.providerLabel,
        modelType: target.modelType,
        model: target.model,
        modelLabel: target.modelLabel,
        capturedAt: new Date()
    }
}

export function assertRequestStatus(request: ModelAccessRequest, expected: ModelAccessRequestStatusEnum) {
    if (request.status !== expected) {
        throw new BadRequestException(
            translate(
                'server-ai:Error.ModelAccessInvalidRequestStatus',
                `The request must be ${expected} for this action.`
            )
        )
    }
}

export function requireActor() {
    const actor = RequestContext.currentUser()
    if (!actor?.id) {
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessAuthenticatedUserRequired', 'Authenticated user is required.')
        )
    }
    return actor
}

export function requireTenant() {
    const tenantId = RequestContext.currentTenantId()
    if (!tenantId) {
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessTenantContextRequired', 'Tenant context is required.')
        )
    }
    return tenantId
}

export function requireUser() {
    const userId = RequestContext.currentUserId()
    if (!userId) {
        throw new ForbiddenException(
            translate('server-ai:Error.ModelAccessAuthenticatedUserRequired', 'Authenticated user is required.')
        )
    }
    return userId
}

export function currentScope() {
    return {
        tenantId: requireTenant(),
        organizationId: RequestContext.getOrganizationId()
    }
}

export function userName(user: IUser) {
    return (
        user.fullName?.trim() ||
        user.name?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email?.trim() ||
        user.username?.trim() ||
        user.id
    )
}

export function requireText(value: string | null | undefined, key: string, fallback: string) {
    const text = value?.trim()
    if (!text) {
        throw new BadRequestException(translate(key, fallback))
    }
    return text
}

export function optionalText(value?: string | null) {
    return value?.trim() || null
}

export function pageSize(value?: number) {
    return Math.min(Math.max(Number(value ?? 50), 1), MAX_PAGE_SIZE)
}

export function pageOffset(value?: number) {
    return Math.max(Number(value ?? 0), 0)
}

export function isUniqueViolation(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        error.code === '23505'
    )
}

export function translate(key: string, fallback: string) {
    const message = t(key, { defaultValue: fallback })
    return typeof message === 'string' && message !== key ? message : fallback
}

export function userHasPermission(user: IUser, permission: AIPermissionsEnum) {
    return user.role?.rolePermissions?.some(
        (rolePermission) => rolePermission.enabled && rolePermission.permission === permission
    )
}

export function canManageTargetScope(target: {
    ownershipScope: ModelAccessOwnershipScopeEnum
    organizationId?: string | null
}) {
    const targetMatchesCurrentScope =
        target.ownershipScope === ModelAccessOwnershipScopeEnum.Tenant
            ? RequestContext.isTenantScope()
            : RequestContext.isOrganizationScope() &&
              RequestContext.getOrganizationId() === (target.organizationId ?? null)
    if (!targetMatchesCurrentScope) {
        return false
    }
    return [
        AIPermissionsEnum.COPILOT_EDIT,
        AIPermissionsEnum.MEMBERSHIP_EDIT,
        AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT
    ].some((permission) => RequestContext.hasPermission(permission, false))
}

export function assertRequesterIsNotManager(target: ModelTarget) {
    if (canManageTargetScope(target)) {
        throw new ForbiddenException(
            translate(
                'server-ai:Error.ModelAccessManagerCannotRequest',
                'Users who manage this scope cannot request personal model access.'
            )
        )
    }
}
