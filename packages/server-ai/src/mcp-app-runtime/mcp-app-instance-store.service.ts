import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { Inject, Injectable } from '@nestjs/common'
import type { RedisClientType } from 'redis'

const APP_INSTANCE_KEY_PREFIX = 'xpert:mcp:app-instance:'
const APP_INSTANCE_MAX_BYTES = 40 * 1024 * 1024
const APP_INSTANCE_TOMBSTONE_TTL_MS = 30 * 60 * 1000

export interface McpAppInstanceSnapshot {
    version: 1
    stateVersion: number
    appInstanceId: string
    tenantId?: string
    organizationId?: string
    workspaceId?: string
    userId?: string
    toolsetId: string
    serverName: string
    toolName: string
    displayName: string
    resourceUri: string
    toolCallId?: string
    toolInput?: unknown
    toolResult?: unknown
    modelContext?: unknown
    messages?: unknown[]
    logs?: unknown[]
    createdAt: number
    expiresAt: number
}

@Injectable()
export class McpAppInstanceStoreService {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

    async save(snapshot: McpAppInstanceSnapshot): Promise<boolean> {
        const ttl = Math.max(0, snapshot.expiresAt - Date.now())
        if (!ttl) {
            await this.delete(snapshot.appInstanceId)
            return false
        }
        const serialized = JSON.stringify(snapshot)
        if (Buffer.byteLength(serialized, 'utf8') > APP_INSTANCE_MAX_BYTES) {
            throw new Error('MCP App instance snapshot exceeds the persistence limit')
        }
        const saved = await this.redis.eval(SAVE_IF_CURRENT_SCRIPT, {
            keys: [instanceKey(snapshot.appInstanceId)],
            arguments: [serialized, String(snapshot.stateVersion), String(ttl)]
        })
        return saved === 1
    }

    async get(appInstanceId: string): Promise<McpAppInstanceSnapshot | null> {
        const raw = await this.redis.get(instanceKey(appInstanceId))
        if (!raw) return null
        if (isDeletedSnapshot(raw)) return null
        let snapshot: McpAppInstanceSnapshot | null = null
        try {
            snapshot = parseSnapshot(JSON.parse(raw))
        } catch {
            snapshot = null
        }
        if (!snapshot || snapshot.appInstanceId !== appInstanceId || snapshot.expiresAt <= Date.now()) {
            await this.delete(appInstanceId)
            return null
        }
        return snapshot
    }

    async delete(appInstanceId: string) {
        await this.redis.set(instanceKey(appInstanceId), JSON.stringify({ version: 1, deleted: true }), {
            PX: APP_INSTANCE_TOMBSTONE_TTL_MS
        })
    }
}

function instanceKey(appInstanceId: string) {
    return `${APP_INSTANCE_KEY_PREFIX}${appInstanceId}`
}

const SAVE_IF_CURRENT_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current then
    local ok, value = pcall(cjson.decode, current)
    if ok then
        if value.deleted == true then
            return 0
        end
        local currentVersion = tonumber(value.stateVersion or 0)
        local incomingVersion = tonumber(ARGV[2])
        if currentVersion > incomingVersion then
            return 0
        end
        if currentVersion == incomingVersion then
            if current == ARGV[1] then
                redis.call('PEXPIRE', KEYS[1], ARGV[3])
                return 1
            end
            return 0
        end
    end
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return 1
`

function isDeletedSnapshot(raw: string) {
    try {
        const value: unknown = JSON.parse(raw)
        return (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            Reflect.get(value, 'version') === 1 &&
            Reflect.get(value, 'deleted') === true
        )
    } catch {
        return false
    }
}

function parseSnapshot(value: unknown): McpAppInstanceSnapshot | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    const version = Reflect.get(value, 'version')
    // Version 1 snapshots created before replica reconciliation did not carry a state version.
    const stateVersion = readNumber(value, 'stateVersion') ?? 1
    const appInstanceId = readString(value, 'appInstanceId')
    const toolsetId = readString(value, 'toolsetId')
    const serverName = readString(value, 'serverName')
    const toolName = readString(value, 'toolName')
    const displayName = readString(value, 'displayName')
    const resourceUri = readString(value, 'resourceUri')
    const createdAt = readNumber(value, 'createdAt')
    const expiresAt = readNumber(value, 'expiresAt')
    if (
        version !== 1 ||
        stateVersion === undefined ||
        !Number.isInteger(stateVersion) ||
        stateVersion < 1 ||
        !appInstanceId ||
        !toolsetId ||
        !serverName ||
        !toolName ||
        !displayName ||
        !resourceUri?.startsWith('ui://') ||
        createdAt === undefined ||
        expiresAt === undefined
    ) {
        return null
    }
    const messages = Reflect.get(value, 'messages')
    const logs = Reflect.get(value, 'logs')
    return {
        version: 1,
        stateVersion,
        appInstanceId,
        toolsetId,
        serverName,
        toolName,
        displayName,
        resourceUri,
        createdAt,
        expiresAt,
        ...optionalStringFields(value),
        ...(Reflect.has(value, 'toolInput') ? { toolInput: Reflect.get(value, 'toolInput') } : {}),
        ...(Reflect.has(value, 'toolResult') ? { toolResult: Reflect.get(value, 'toolResult') } : {}),
        ...(Reflect.has(value, 'modelContext') ? { modelContext: Reflect.get(value, 'modelContext') } : {}),
        ...(Array.isArray(messages) ? { messages } : {}),
        ...(Array.isArray(logs) ? { logs } : {})
    }
}

function optionalStringFields(value: object) {
    const tenantId = readString(value, 'tenantId')
    const organizationId = readString(value, 'organizationId')
    const workspaceId = readString(value, 'workspaceId')
    const userId = readString(value, 'userId')
    const toolCallId = readString(value, 'toolCallId')
    return {
        ...(tenantId ? { tenantId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
        ...(userId ? { userId } : {}),
        ...(toolCallId ? { toolCallId } : {})
    }
}

function readString(value: object, key: string) {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field : undefined
}

function readNumber(value: object, key: string) {
    const field = Reflect.get(value, key)
    return typeof field === 'number' && Number.isFinite(field) ? field : undefined
}
