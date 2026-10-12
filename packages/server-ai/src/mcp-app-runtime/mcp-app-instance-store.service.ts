import { parseMiddlewareAppSource, type MiddlewareAppSource } from './middleware-app-source'
import { readMcpAppExecutionContext, type McpAppExecutionContext } from './mcp-app-execution-context'
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
    executionContext?: McpAppExecutionContext
    toolsetId?: string
    source?: MiddlewareAppSource
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
        if (!ttl) return false
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
            snapshot = parseMcpAppInstanceSnapshot(JSON.parse(raw))
        } catch {
            snapshot = null
        }
        if (!snapshot || snapshot.appInstanceId !== appInstanceId || snapshot.expiresAt <= Date.now()) {
            await this.redis.eval(TOMBSTONE_IF_RAW_SCRIPT, {
                keys: [instanceKey(appInstanceId)],
                arguments: [raw, JSON.stringify({ version: 1, deleted: true }), String(APP_INSTANCE_TOMBSTONE_TTL_MS)]
            })
            return null
        }
        return snapshot
    }

    /** Called only after current message, Assistant and tool access have authorized an explicit resume. */
    async resume(snapshot: McpAppInstanceSnapshot, expiresAt: number): Promise<McpAppInstanceSnapshot> {
        const now = Date.now()
        const ttl = Math.ceil(expiresAt - now)
        if (!Number.isFinite(ttl) || ttl <= 0) {
            throw new RangeError('MCP App resumed lease must expire in the future')
        }
        // Keep this property first so Lua can replace its number without re-encoding empty JSON arrays.
        const { stateVersion, ...state } = snapshot
        const serialized = JSON.stringify({ stateVersion, ...state, expiresAt })
        if (Buffer.byteLength(serialized, 'utf8') > APP_INSTANCE_MAX_BYTES) {
            throw new Error('MCP App instance snapshot exceeds the persistence limit')
        }
        const saved = await this.redis.eval(RESUME_AUTHORIZED_SCRIPT, {
            keys: [instanceKey(snapshot.appInstanceId)],
            arguments: [serialized, String(snapshot.stateVersion), String(now), String(ttl)]
        })
        const resumed = typeof saved === 'string' ? parseMcpAppInstanceSnapshot(JSON.parse(saved)) : null
        if (!resumed || resumed.appInstanceId !== snapshot.appInstanceId) {
            throw new Error('MCP App resumed snapshot could not be persisted')
        }
        return resumed
    }

    async delete(appInstanceId: string, expectedStateVersion?: number): Promise<boolean> {
        if (
            expectedStateVersion !== undefined &&
            (!Number.isInteger(expectedStateVersion) || expectedStateVersion < 1)
        ) {
            throw new RangeError('MCP App deletion requires a valid state version')
        }
        const removed = await this.redis.eval(TOMBSTONE_IF_VERSION_SCRIPT, {
            keys: [instanceKey(appInstanceId)],
            arguments: [
                JSON.stringify({ version: 1, deleted: true }),
                String(APP_INSTANCE_TOMBSTONE_TTL_MS),
                expectedStateVersion === undefined ? '' : String(expectedStateVersion)
            ]
        })
        return removed === 1
    }
}

function instanceKey(appInstanceId: string) {
    return `${APP_INSTANCE_KEY_PREFIX}${appInstanceId}`
}

const TOMBSTONE_IF_RAW_SCRIPT = `
local expectedRaw = ARGV[1]
if redis.call('GET', KEYS[1]) ~= expectedRaw then
    return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`

const TOMBSTONE_IF_VERSION_SCRIPT = `
local expectedVersion = ARGV[3]
local current = redis.call('GET', KEYS[1])
if current and expectedVersion ~= '' then
    local ok, value = pcall(cjson.decode, current)
    if not ok or type(value) ~= 'table' then return 0 end
    if value.deleted == true then return 1 end
    if tonumber(value.stateVersion or 1) ~= tonumber(expectedVersion) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
`

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

const RESUME_AUTHORIZED_SCRIPT = `
local nextVersion = math.max(tonumber(ARGV[2]) + 1, tonumber(ARGV[3]))
local incoming = cjson.decode(ARGV[1])
local current = redis.call('GET', KEYS[1])
if current then
    local ok, value = pcall(cjson.decode, current)
    if ok and type(value) == 'table' then
        local currentVersion = tonumber(value.stateVersion) or 0
        if value.version == 1 and value.deleted ~= true
            and value.appInstanceId == incoming.appInstanceId
            and currentVersion >= 1 and currentVersion % 1 == 0
            and (tonumber(value.expiresAt) or 0) > tonumber(ARGV[3]) then
            return current
        end
        nextVersion = math.max(nextVersion, currentVersion + 1)
    end
end
local resumed, replacements = string.gsub(ARGV[1], '^%{"stateVersion":%d+',
    '{"stateVersion":' .. string.format('%.0f', nextVersion), 1)
if replacements ~= 1 then
    return redis.error_reply('MCP App resume requires an initial state version')
end
redis.call('SET', KEYS[1], resumed, 'PX', ARGV[4])
return resumed
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

export function parseMcpAppInstanceSnapshot(value: unknown): McpAppInstanceSnapshot | null {
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
        (!toolsetId && !parseMiddlewareAppSource(Reflect.get(value, 'source'))) ||
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
        source: parseMiddlewareAppSource(Reflect.get(value, 'source')),
        serverName,
        toolName,
        displayName,
        resourceUri,
        createdAt,
        expiresAt,
        ...optionalStringFields(value),
        executionContext: readMcpAppExecutionContext(Reflect.get(value, 'executionContext')),
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
