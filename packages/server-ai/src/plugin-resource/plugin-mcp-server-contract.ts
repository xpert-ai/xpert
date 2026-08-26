import {
    JSONValue,
    MCP_CAPABILITY_DESCRIPTOR_VERSION,
    MCP_CAPABILITY_TYPES,
    MCP_CAPABILITY_VISIBILITIES,
    MCP_REQUIRED_CONTEXTS,
    MCPServerType,
    MCP_TOOL_IDEMPOTENCY,
    MCP_TOOL_RISKS,
    MCP_TOOL_SIDE_EFFECTS,
    McpCapabilityDeclaration,
    McpJsonSchema,
    PLUGIN_MCP_TOOL_APPROVAL_MODE,
    TMCPServer,
    XpertPluginMcpServerPolicy
} from '@xpert-ai/contracts'

export type ParsedPluginMcpServer = {
    server: TMCPServer
    policy: XpertPluginMcpServerPolicy
    capabilities: McpCapabilityDeclaration[]
    capabilitySource?: string
}

export function parsePluginMcpServerConfig(
    value: JSONValue | null | undefined,
    componentKey: string
): ParsedPluginMcpServer {
    if (!isObjectValue(value)) {
        throw new Error(`MCP component '${componentKey}' has invalid config`)
    }

    const command = readStringField(value, 'command')
    const url = readStringField(value, 'url')
    const explicitType = readStringField(value, 'type')
    const serverType = normalizeMcpServerType(explicitType ?? (command ? 'stdio' : url ? 'http' : undefined))
    if (!serverType) {
        throw new Error(`MCP component '${componentKey}' has invalid transport`)
    }

    const policy = readMcpPolicy(value)
    const capabilityConfig = readCapabilityConfig(value, componentKey)
    return {
        server: {
            type: serverType,
            ...(command ? { command } : {}),
            ...(url ? { url } : {}),
            ...readStringArrayProperty(value, 'args'),
            ...readStringMapProperty(value, 'env'),
            ...readStringMapProperty(value, 'headers'),
            ...(readStringField(value, 'encoding') ? { encoding: readStringField(value, 'encoding') } : {}),
            ...(readStringField(value, 'encodingErrorHandler')
                ? { encodingErrorHandler: readStringField(value, 'encodingErrorHandler') }
                : {}),
            ...(policy.runtime ? { runtime: policy.runtime } : {})
        },
        policy,
        ...capabilityConfig
    }
}

function readCapabilityConfig(value: object, componentKey: string) {
    const raw = Reflect.get(value, 'capabilities')
    if (raw === undefined) return { capabilities: [] }
    if (typeof raw === 'string' && raw.trim()) {
        return { capabilities: [], capabilitySource: raw.trim() }
    }
    return { capabilities: parsePluginMcpCapabilityDeclarations(raw, componentKey) }
}

export function parsePluginMcpCapabilityDeclarations(value: unknown, componentKey: string): McpCapabilityDeclaration[] {
    if (!Array.isArray(value)) {
        throw new Error(`MCP component '${componentKey}' capabilities must be an array or a relative JSON file path`)
    }
    return value.map((item, index) => parseCapabilityDeclaration(item, componentKey, index))
}

function parseCapabilityDeclaration(value: unknown, componentKey: string, index: number): McpCapabilityDeclaration {
    if (!isObjectValue(value)) throw invalidCapability(componentKey, index)
    if (Reflect.get(value, 'descriptorVersion') !== MCP_CAPABILITY_DESCRIPTOR_VERSION) {
        throw invalidCapability(componentKey, index)
    }
    const capabilityType = readEnumField(value, 'capabilityType', MCP_CAPABILITY_TYPES)
    const capabilityKey = readStringField(value, 'capabilityKey')
    const requiredContext = readEnumArrayField(value, 'requiredContext', MCP_REQUIRED_CONTEXTS)
    const visibility = readEnumArrayField(value, 'visibility', MCP_CAPABILITY_VISIBILITIES)
    if (!capabilityType || !capabilityKey || !requiredContext || !visibility) {
        throw invalidCapability(componentKey, index)
    }
    const common = {
        descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
        capabilityKey,
        title: readStringField(value, 'title'),
        description: readStringField(value, 'description'),
        requiredContext,
        visibility,
        source: readCapabilitySource(value)
    }

    switch (capabilityType) {
        case 'tool': {
            const inputSchema = readJsonSchema(value, 'inputSchema')
            const outputSchema = readOptionalJsonSchema(value, 'outputSchema')
            const behavior = readToolBehavior(Reflect.get(value, 'behavior'))
            const annotations = readToolAnnotations(value)
            if (!inputSchema || outputSchema === null || !behavior || annotations === null) {
                throw invalidCapability(componentKey, index)
            }
            return {
                ...common,
                capabilityType,
                inputSchema,
                ...(outputSchema ? { outputSchema } : {}),
                behavior,
                ...annotations,
                ...(readStringField(value, 'appResourceKey')
                    ? { appResourceKey: readStringField(value, 'appResourceKey') }
                    : {}),
                ...readTaskMode(value)
            }
        }
        case 'resource': {
            const uri = readStringField(value, 'uri')
            if (!uri) throw invalidCapability(componentKey, index)
            return {
                ...common,
                capabilityType,
                uri,
                ...(readStringField(value, 'mimeType') ? { mimeType: readStringField(value, 'mimeType') } : {}),
                ...readCacheTtl(value)
            }
        }
        case 'resource_template': {
            const uriTemplate = readStringField(value, 'uriTemplate')
            const argumentSchema = readJsonSchema(value, 'argumentSchema')
            const supportsCompletion = Reflect.get(value, 'supportsCompletion')
            if (!uriTemplate || !argumentSchema || typeof supportsCompletion !== 'boolean') {
                throw invalidCapability(componentKey, index)
            }
            return {
                ...common,
                capabilityType,
                uriTemplate,
                argumentSchema,
                supportsCompletion,
                ...readCacheTtl(value)
            }
        }
        case 'prompt': {
            const name = readStringField(value, 'name')
            const argumentSchema = readJsonSchema(value, 'argumentSchema')
            if (!name || !argumentSchema) throw invalidCapability(componentKey, index)
            return {
                ...common,
                capabilityType,
                name,
                argumentSchema,
                ...readOptionalBoolean(value, 'supportsCompletion')
            }
        }
        case 'app': {
            const entry = readStringField(value, 'entry')
            const csp = readAppCsp(value)
            const permissions = readAppPermissions(value)
            if (!entry || csp === null || permissions === null) throw invalidCapability(componentKey, index)
            return {
                ...common,
                capabilityType,
                entry,
                ...csp,
                ...permissions
            }
        }
    }
}

function readCapabilitySource(value: object) {
    const source = Reflect.get(value, 'source')
    if (!isObjectValue(source)) return undefined
    const pluginName = readStringField(source, 'pluginName')
    const pluginVersion = readStringField(source, 'pluginVersion')
    const serverName = readStringField(source, 'serverName')
    const remoteName = readStringField(source, 'remoteName')
    return pluginName || pluginVersion || serverName || remoteName
        ? { pluginName, pluginVersion, serverName, remoteName }
        : undefined
}

function readToolBehavior(value: unknown) {
    if (!isObjectValue(value)) return null
    const risk = readEnumField(value, 'risk', MCP_TOOL_RISKS)
    const sideEffect = readEnumField(value, 'sideEffect', MCP_TOOL_SIDE_EFFECTS)
    const idempotency = readEnumField(value, 'idempotency', MCP_TOOL_IDEMPOTENCY)
    return risk && sideEffect && idempotency ? { risk, sideEffect, idempotency } : null
}

function readToolAnnotations(value: object) {
    const raw = Reflect.get(value, 'annotations')
    if (raw === undefined) return {}
    if (!isObjectValue(raw)) return null
    const annotations = {
        ...(readStringField(raw, 'title') ? { title: readStringField(raw, 'title') } : {}),
        ...readOptionalBoolean(raw, 'readOnlyHint'),
        ...readOptionalBoolean(raw, 'destructiveHint'),
        ...readOptionalBoolean(raw, 'idempotentHint'),
        ...readOptionalBoolean(raw, 'openWorldHint')
    }
    return { annotations }
}

function readTaskMode(value: object) {
    const taskMode = Reflect.get(value, 'taskMode')
    const taskMaxLifetimeMs = readPositiveNumberField(value, 'taskMaxLifetimeMs')
    return taskMode === 'optional' || taskMode === 'required'
        ? { taskMode, ...(taskMaxLifetimeMs === undefined ? {} : { taskMaxLifetimeMs }) }
        : {}
}

function readCacheTtl(value: object) {
    const cacheTtlMs = readPositiveNumberField(value, 'cacheTtlMs')
    return cacheTtlMs === undefined ? {} : { cacheTtlMs }
}

function readAppCsp(value: object) {
    const raw = Reflect.get(value, 'csp')
    if (raw === undefined) return {}
    if (!isObjectValue(raw)) return null
    const connectDomains = readStringArrayField(raw, 'connectDomains')
    const resourceDomains = readStringArrayField(raw, 'resourceDomains')
    return { csp: { ...(connectDomains ? { connectDomains } : {}), ...(resourceDomains ? { resourceDomains } : {}) } }
}

function readAppPermissions(value: object) {
    const raw = Reflect.get(value, 'permissions')
    if (raw === undefined) return {}
    if (!isObjectValue(raw)) return null
    return {
        permissions: {
            ...readOptionalBoolean(raw, 'clipboardWrite'),
            ...readOptionalBoolean(raw, 'camera'),
            ...readOptionalBoolean(raw, 'microphone'),
            ...readOptionalBoolean(raw, 'geolocation')
        }
    }
}

function readOptionalBoolean(value: object, key: string) {
    const field = Reflect.get(value, key)
    return typeof field === 'boolean' ? { [key]: field } : {}
}

function readJsonSchema(value: object, key: string): McpJsonSchema | undefined {
    return jsonSchema(Reflect.get(value, key))
}

function readOptionalJsonSchema(value: object, key: string): McpJsonSchema | null | undefined {
    const raw = Reflect.get(value, key)
    return raw === undefined ? undefined : (jsonSchema(raw) ?? null)
}

function jsonSchema(value: unknown): McpJsonSchema | undefined {
    if (!isObjectValue(value)) return undefined
    const schema: McpJsonSchema = {}
    for (const [key, item] of Object.entries(value)) {
        if (!isJsonValue(item)) return undefined
        schema[key] = item
    }
    return schema
}

function isJsonValue(value: unknown): value is JSONValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        return true
    }
    if (Array.isArray(value)) return value.every(isJsonValue)
    return isObjectValue(value) && Object.values(value).every(isJsonValue)
}

function readEnumField<const TValues extends readonly string[]>(value: object, key: string, values: TValues) {
    const field = Reflect.get(value, key)
    return isEnumValue(field, values) ? field : undefined
}

function readEnumArrayField<const TValues extends readonly string[]>(value: object, key: string, values: TValues) {
    const field = Reflect.get(value, key)
    if (!Array.isArray(field)) return undefined
    const result: TValues[number][] = []
    for (const item of field) {
        if (!isEnumValue(item, values)) return undefined
        result.push(item)
    }
    return result
}

function isEnumValue<const TValues extends readonly string[]>(
    value: unknown,
    values: TValues
): value is TValues[number] {
    return typeof value === 'string' && values.some((item) => item === value)
}

function invalidCapability(componentKey: string, index: number) {
    return new Error(`MCP component '${componentKey}' capability at index ${index} is invalid`)
}

export function mergePluginMcpPolicies(
    manifestPolicy?: XpertPluginMcpServerPolicy,
    override?: XpertPluginMcpServerPolicy
): XpertPluginMcpServerPolicy {
    const manifestTools = manifestPolicy?.enabledTools
    const requestedTools = override?.enabledTools
    const enabledTools = requestedTools
        ? manifestTools
            ? requestedTools.filter((name) => manifestTools.includes(name))
            : requestedTools
        : manifestTools
    const mergedTools = {
        ...(manifestPolicy?.tools ?? {}),
        ...(override?.tools ?? {})
    }

    return removeUndefinedPolicy({
        enabled: override?.enabled ?? manifestPolicy?.enabled,
        defaultToolsApprovalMode: override?.defaultToolsApprovalMode ?? manifestPolicy?.defaultToolsApprovalMode,
        enabledTools,
        // Runtime launch policy belongs to the installed plugin manifest. Request-level overrides cannot relax it.
        runtime: manifestPolicy?.runtime ?? override?.runtime,
        tools: Object.keys(mergedTools).length ? mergedTools : undefined
    })
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function readPositiveNumberField(value: object, key: string): number | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'number' && Number.isFinite(field) && field > 0 ? field : undefined
}

function readStringArrayField(value: object, key: string): string[] | undefined {
    const field = Reflect.get(value, key)
    if (!Array.isArray(field) || !field.every((item) => typeof item === 'string' && item.trim())) {
        return undefined
    }
    return field.map((item) => item.trim())
}

function readStringArrayProperty(source: object, key: 'args') {
    const value = Reflect.get(source, key)
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        return {}
    }
    return value.length ? { [key]: [...value] as string[] } : {}
}

function readStringMapProperty(source: object, key: 'env' | 'headers') {
    const value = Reflect.get(source, key)
    if (!isObjectValue(value)) {
        return {}
    }
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    return entries.length ? { [key]: Object.fromEntries(entries) } : {}
}

function normalizeMcpServerType(value: string | undefined): MCPServerType | null {
    if (value === MCPServerType.STDIO) return MCPServerType.STDIO
    if (value === MCPServerType.SSE) return MCPServerType.SSE
    if (value === MCPServerType.HTTP) return MCPServerType.HTTP
    if (value === MCPServerType.CODE) return MCPServerType.CODE
    return null
}

function readApprovalMode(value: unknown) {
    return value === PLUGIN_MCP_TOOL_APPROVAL_MODE.PROMPT ||
        value === PLUGIN_MCP_TOOL_APPROVAL_MODE.APPROVE ||
        value === PLUGIN_MCP_TOOL_APPROVAL_MODE.DENY
        ? value
        : undefined
}

function readRuntimePolicy(value: unknown): XpertPluginMcpServerPolicy['runtime'] | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const runtime = {
        provider: readStringField(value, 'provider'),
        startupTimeoutMs: readPositiveNumberField(value, 'startupTimeoutMs'),
        idleTimeoutMs: readPositiveNumberField(value, 'idleTimeoutMs'),
        maxLifetimeMs: readPositiveNumberField(value, 'maxLifetimeMs'),
        allowedCommands: readStringArrayField(value, 'allowedCommands')
    }
    return Object.values(runtime).some((item) => item !== undefined) ? runtime : undefined
}

function readMcpPolicy(value: object): XpertPluginMcpServerPolicy {
    const policyValue = Reflect.get(value, 'policy')
    if (!isObjectValue(policyValue)) {
        return {}
    }
    const enabledTools = readStringArrayField(policyValue, 'enabledTools')
    const defaultToolsApprovalMode = readApprovalMode(Reflect.get(policyValue, 'defaultToolsApprovalMode'))
    const toolsValue = Reflect.get(policyValue, 'tools')
    const runtime = readRuntimePolicy(Reflect.get(policyValue, 'runtime'))
    const tools: XpertPluginMcpServerPolicy['tools'] = {}
    if (isObjectValue(toolsValue)) {
        for (const [toolName, toolPolicy] of Object.entries(toolsValue)) {
            if (!isObjectValue(toolPolicy)) continue
            const approvalMode = readApprovalMode(Reflect.get(toolPolicy, 'approvalMode'))
            if (approvalMode) tools[toolName] = { approvalMode }
        }
    }
    return removeUndefinedPolicy({
        enabled:
            typeof Reflect.get(policyValue, 'enabled') === 'boolean' ? Reflect.get(policyValue, 'enabled') : undefined,
        defaultToolsApprovalMode,
        enabledTools,
        runtime,
        tools: Object.keys(tools).length ? tools : undefined
    })
}

function removeUndefinedPolicy(policy: XpertPluginMcpServerPolicy): XpertPluginMcpServerPolicy {
    return {
        ...(typeof policy.enabled === 'boolean' ? { enabled: policy.enabled } : {}),
        ...(policy.defaultToolsApprovalMode ? { defaultToolsApprovalMode: policy.defaultToolsApprovalMode } : {}),
        ...(Array.isArray(policy.enabledTools) ? { enabledTools: policy.enabledTools } : {}),
        ...(policy.runtime ? { runtime: policy.runtime } : {}),
        ...(policy.tools && Object.keys(policy.tools).length ? { tools: policy.tools } : {})
    }
}
