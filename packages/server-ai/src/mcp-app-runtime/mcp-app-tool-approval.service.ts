import { REDIS_CLIENT, RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { t } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'

const APPROVAL_KEY_PREFIX = 'xpert:mcp:app-approval:'
const APPROVAL_TTL_MS = 5 * 60 * 1000
const DELETE_IF_UNCHANGED_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
    redis.call('DEL', KEYS[1])
    return current
end
return false
`
const REPLACE_IF_UNCHANGED_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
    return ARGV[2]
end
return false
`

export type McpAppToolRisk = 'read' | 'write' | 'destructive'

interface PendingApproval {
    version: 1
    id: string
    appInstanceId: string
    tenantId?: string
    workspaceId?: string
    userId: string
    toolName: string
    argumentsHash: string
    risk: Exclude<McpAppToolRisk, 'read'>
    approvedAt?: number
    expiresAt: number
}

@Injectable()
export class McpAppToolApprovalService {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

    risk(annotations?: object, trustAnnotations = false): McpAppToolRisk {
        if (readBoolean(annotations, 'destructiveHint')) return 'destructive'
        if (
            trustAnnotations &&
            readBoolean(annotations, 'readOnlyHint') &&
            !readBoolean(annotations, 'openWorldHint')
        ) {
            return 'read'
        }
        return 'write'
    }

    async request(input: {
        appInstanceId: string
        tenantId?: string
        workspaceId?: string
        toolName: string
        arguments: unknown
        risk: Exclude<McpAppToolRisk, 'read'>
    }) {
        const userId = RequestContext.currentUserId()
        if (!userId) throw this.forbidden()
        const id = randomUUID()
        const approval: PendingApproval = {
            version: 1,
            id,
            appInstanceId: input.appInstanceId,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            userId,
            toolName: input.toolName,
            argumentsHash: hashArguments(input.arguments),
            risk: input.risk,
            expiresAt: Date.now() + APPROVAL_TTL_MS
        }
        await this.redis.set(approvalKey(id), JSON.stringify(approval), { PX: APPROVAL_TTL_MS })
        return { approvalId: id, risk: approval.risk, expiresAt: approval.expiresAt }
    }

    async approve(appInstanceId: string, approvalId: string) {
        const raw = await this.redis.get(approvalKey(approvalId))
        const approval = parseStoredApproval(raw)
        const userId = RequestContext.currentUserId()
        if (!approval || approval.appInstanceId !== appInstanceId) throw this.notFound()
        if (!userId || approval.userId !== userId) throw this.forbidden()
        approval.approvedAt = Date.now()
        const ttl = Math.max(1, approval.expiresAt - Date.now())
        if (!(await this.replaceIfUnchanged(approvalId, raw, JSON.stringify(approval), ttl))) throw this.notFound()
        return {
            approved: true,
            approvalId,
            expiresAt: approval.expiresAt,
            toolName: approval.toolName,
            risk: approval.risk
        }
    }

    async reject(appInstanceId: string, approvalId: string) {
        const raw = await this.redis.get(approvalKey(approvalId))
        const approval = parseStoredApproval(raw)
        const userId = RequestContext.currentUserId()
        if (!approval || approval.appInstanceId !== appInstanceId) throw this.notFound()
        if (!userId || approval.userId !== userId) throw this.forbidden()
        if (!(await this.deleteIfUnchanged(approvalId, raw))) throw this.notFound()
        return {
            approved: false,
            rejected: true,
            approvalId,
            toolName: approval.toolName,
            risk: approval.risk
        }
    }

    async consume(input: { approvalId: string; appInstanceId: string; toolName: string; arguments: unknown }) {
        const raw = await this.redis.get(approvalKey(input.approvalId))
        const approval = parseStoredApproval(raw)
        const userId = RequestContext.currentUserId()
        if (
            !approval ||
            !approval.approvedAt ||
            approval.expiresAt <= Date.now() ||
            approval.appInstanceId !== input.appInstanceId ||
            approval.toolName !== input.toolName ||
            approval.argumentsHash !== hashArguments(input.arguments) ||
            !userId ||
            approval.userId !== userId
        ) {
            throw this.forbidden()
        }
        if (!(await this.deleteIfUnchanged(input.approvalId, raw))) throw this.forbidden()
    }

    private async deleteIfUnchanged(approvalId: string, raw: string | null) {
        if (!raw) return false
        const deleted = await this.redis.eval(DELETE_IF_UNCHANGED_SCRIPT, {
            keys: [approvalKey(approvalId)],
            arguments: [raw]
        })
        return deleted === raw
    }

    private async replaceIfUnchanged(approvalId: string, raw: string | null, updated: string, ttl: number) {
        if (!raw) return false
        const replaced = await this.redis.eval(REPLACE_IF_UNCHANGED_SCRIPT, {
            keys: [approvalKey(approvalId)],
            arguments: [raw, updated, String(ttl)]
        })
        return replaced === updated
    }

    private forbidden() {
        return new ForbiddenException(
            t('server-ai:Error.McpAppApprovalDenied', {
                defaultValue: 'MCP App tool approval is missing, invalid, expired, or was issued for another call.'
            })
        )
    }

    private notFound() {
        return new NotFoundException(
            t('server-ai:Error.McpAppApprovalNotFound', {
                defaultValue: 'MCP App tool approval request was not found or has expired.'
            })
        )
    }
}

function parseStoredApproval(raw: string | null) {
    if (!raw) return null
    try {
        return parseApproval(JSON.parse(raw))
    } catch {
        return null
    }
}

function approvalKey(id: string) {
    return `${APPROVAL_KEY_PREFIX}${id}`
}

function hashArguments(value: unknown) {
    return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (typeof value === 'object' && value !== null) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`)
            .join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
}

function readBoolean(value: object | undefined, key: string) {
    return value ? Reflect.get(value, key) === true : false
}

function parseApproval(value: unknown): PendingApproval | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const risk = Reflect.get(value, 'risk')
    const approvedAt = Reflect.get(value, 'approvedAt')
    const approval: PendingApproval = {
        version: Reflect.get(value, 'version'),
        id: Reflect.get(value, 'id'),
        appInstanceId: Reflect.get(value, 'appInstanceId'),
        tenantId: Reflect.get(value, 'tenantId'),
        workspaceId: Reflect.get(value, 'workspaceId'),
        userId: Reflect.get(value, 'userId'),
        toolName: Reflect.get(value, 'toolName'),
        argumentsHash: Reflect.get(value, 'argumentsHash'),
        risk,
        expiresAt: Reflect.get(value, 'expiresAt'),
        ...(typeof approvedAt === 'number' ? { approvedAt } : {})
    }
    return approval.version === 1 &&
        typeof approval.id === 'string' &&
        typeof approval.appInstanceId === 'string' &&
        typeof approval.userId === 'string' &&
        typeof approval.toolName === 'string' &&
        typeof approval.argumentsHash === 'string' &&
        (risk === 'write' || risk === 'destructive') &&
        typeof approval.expiresAt === 'number'
        ? approval
        : null
}
