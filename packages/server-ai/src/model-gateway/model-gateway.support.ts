import {
    IModelGatewayApiKey,
    ModelGatewayApiKeyLifetimeEnum,
    DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
    MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { encryptSecret, decryptSecret, User } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { environment } from '@xpert-ai/server-config'
import { createHash } from 'node:crypto'
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { ModelGatewayApiKey } from './model-gateway-api-key.entity'
import { modelGatewayMessage } from './model-gateway.i18n'
const MAX_PAGE_SIZE = 200
export function userName(user: User) {
    return (
        user.name?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email?.trim() ||
        user.username?.trim() ||
        user.id
    )
}

export function resolveKeyExpiration(lifetime: ModelGatewayApiKeyLifetimeEnum) {
    if (lifetime === ModelGatewayApiKeyLifetimeEnum.Permanent) {
        return null
    }
    const days = {
        [ModelGatewayApiKeyLifetimeEnum.Days30]: 30,
        [ModelGatewayApiKeyLifetimeEnum.Days90]: 90,
        [ModelGatewayApiKeyLifetimeEnum.Days180]: 180
    }[lifetime]
    if (!days) {
        throw new BadRequestException(
            modelGatewayMessage('ModelGatewayKeyLifetimeUnsupported', 'Unsupported API key lifetime.')
        )
    }
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export function toPublicApiKey(key: ModelGatewayApiKey, secret?: string): IModelGatewayApiKey {
    return {
        id: key.id,
        createdById: key.createdById,
        updatedById: key.updatedById,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        tenantId: key.tenantId,
        organizationId: key.organizationId,
        userId: key.userId,
        name: key.name,
        prefix: key.prefix,
        ...(secret ? { secret } : {}),
        status: key.status,
        validUntil: key.validUntil,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
        revokedById: key.revokedById,
        revokeReason: key.revokeReason
    }
}

export function readBearerToken(authorization?: string) {
    const match = authorization?.match(/^Bearer\s+(\S+)$/i)
    if (!match) {
        throw new UnauthorizedException(
            modelGatewayMessage('ModelGatewayBearerRequired', 'A Bearer API key is required.')
        )
    }
    return match[1]
}

export function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

export function encryptBody(body: unknown) {
    return encryptSecret(JSON.stringify(body), environment.secretsEncryptionKey)
}

export function decryptBody(ciphertext?: string | null) {
    if (!ciphertext) {
        return null
    }
    const body: unknown = JSON.parse(decryptSecret(ciphertext, environment.secretsEncryptionKey))
    return body
}

export function errorCode(error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
        return error.code.slice(0, 100)
    }
    return 'gateway_error'
}

export function currentScope() {
    return {
        tenantId: requireTenant(),
        organizationId: RequestContext.getOrganizationId()
    }
}

export function applyScopeFilter<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    field: string,
    organizationId: string | null
) {
    return organizationId
        ? query.andWhere(`${field} = :scopeOrganizationId`, { scopeOrganizationId: organizationId })
        : query.andWhere(`${field} IS NULL`)
}

export function applyVisibleScopeFilter<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    field: string,
    organizationId: string | null
) {
    return organizationId
        ? query.andWhere(`(${field} IS NULL OR ${field} = :visibleOrganizationId)`, {
              visibleOrganizationId: organizationId
          })
        : query.andWhere(`${field} IS NULL`)
}

export function requireTenantScope() {
    const tenantId = requireTenant()
    if (!RequestContext.isTenantScope()) {
        throw new ForbiddenException(
            modelGatewayMessage('ModelGatewayTenantScopeRequired', 'Tenant scope is required.')
        )
    }
    return tenantId
}

export function requireTenant() {
    const tenantId = RequestContext.currentTenantId()
    if (!tenantId) {
        throw new ForbiddenException(
            modelGatewayMessage('ModelGatewayTenantScopeRequired', 'Tenant scope is required.')
        )
    }
    return tenantId
}

export function requireUserId() {
    const userId = RequestContext.currentUserId()
    if (!userId) {
        throw new ForbiddenException(
            modelGatewayMessage('ModelGatewayAuthenticatedUserRequired', 'Authenticated user is required.')
        )
    }
    return userId
}

export function pageSize(value?: number) {
    return Math.min(Math.max(Number(value ?? 50), 1), MAX_PAGE_SIZE)
}

export function pageOffset(value?: number) {
    return Math.max(Number(value ?? 0), 0)
}

export function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export function isUniqueViolation(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === '23505' || error.code === 'SQLITE_CONSTRAINT')
    )
}

export function buildCallRetentionSql() {
    return `
WITH candidates AS (
    SELECT c.id
    FROM model_gateway_call c
    JOIN tenant_setting te
        ON te."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND te.name = $1
        AND lower(COALESCE(te.value, '')) IN ('1', 'true', 'yes', 'on')
    LEFT JOIN tenant_setting td
        ON td."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND td.name = $2
    WHERE c.source = 'external_api' AND c.status = ANY($5::varchar[])
        AND COALESCE(c."completedAt", c."createdAt") < now() - make_interval(
            days => COALESCE(
                CASE
                    WHEN td.value ~ '^[1-9][0-9]{0,8}$' AND td.value::int <= $4::int THEN td.value::int
                END,
                $3::int
            )
        )
    ORDER BY COALESCE(c."completedAt", c."createdAt") ASC
    LIMIT $6::int
    FOR UPDATE OF c SKIP LOCKED
),
deleted AS (
    DELETE FROM model_gateway_call c
    USING candidates
    WHERE c.id = candidates.id
    RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}

export function readDeletedCount(rows: unknown): number {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 0
    }
    const first = rows[0]
    if (!first || typeof first !== 'object' || !('count' in first)) {
        return 0
    }
    const value = first.count
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
}
