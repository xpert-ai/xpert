import { createHash } from 'node:crypto'
import type {
    JSONValue,
    McpAppCapabilityDescriptor,
    McpCapabilityDescriptor,
    McpJsonSchema,
    McpToolCapabilityDescriptor
} from '@xpert-ai/contracts'
import {
    MCP_CAPABILITY_DESCRIPTOR_VERSION,
    MCP_CAPABILITY_TYPES,
    MCP_CAPABILITY_VISIBILITIES,
    MCP_REQUIRED_CONTEXTS,
    MCP_TOOL_IDEMPOTENCY,
    MCP_TOOL_RISKS,
    MCP_TOOL_SIDE_EFFECTS
} from '@xpert-ai/contracts'
import { isIP } from 'node:net'

export interface McpCapabilityCompatibility {
    changed: boolean
    breaking: boolean
    reasons: string[]
}

type JsonObject = {
    [key: string]: JSONValue
}

const TOOL_RISK_ORDER = ['read', 'write', 'dangerous'] as const
const TOOL_SIDE_EFFECT_ORDER = ['none', 'reversible', 'irreversible'] as const
const TOOL_IDEMPOTENCY_ORDER = ['safe', 'idempotent', 'non_idempotent'] as const
const MAX_CAPABILITY_KEY_LENGTH = 191
const MAX_CAPABILITY_TITLE_LENGTH = 500
const MAX_CAPABILITY_DESCRIPTION_LENGTH = 8_000
const MAX_PROVIDER_INSTRUCTIONS_LENGTH = 8_000
const MAX_CAPABILITY_URI_LENGTH = 2_048
const MAX_CAPABILITY_SCHEMA_BYTES = 128 * 1024
const MAX_APP_CSP_DOMAINS = 50

export function assertValidMcpCapabilityDescriptor(descriptor: McpCapabilityDescriptor) {
    if (descriptor.descriptorVersion !== MCP_CAPABILITY_DESCRIPTOR_VERSION) invalid('descriptor version is invalid')
    if (!MCP_CAPABILITY_TYPES.includes(descriptor.capabilityType)) invalid('capability type is invalid')
    assertIdentifier(descriptor.capabilityKey, 'capability key')
    assertOptionalText(descriptor.title, 'title', MAX_CAPABILITY_TITLE_LENGTH)
    assertOptionalText(descriptor.description, 'description', MAX_CAPABILITY_DESCRIPTION_LENGTH)
    assertOptionalText(descriptor.providerInstructions, 'provider instructions', MAX_PROVIDER_INSTRUCTIONS_LENGTH)
    assertStringArray(descriptor.requiredContext, MCP_REQUIRED_CONTEXTS, 'required context')
    assertStringArray(descriptor.visibility, MCP_CAPABILITY_VISIBILITIES, 'visibility', true)
    assertIdentifier(descriptor.source.toolsetId, 'source toolset id')
    assertOptionalText(descriptor.source.pluginName, 'source plugin name', 500)
    assertOptionalText(descriptor.source.pluginVersion, 'source plugin version', 191)
    assertOptionalText(descriptor.source.serverName, 'source server name', 500)
    assertOptionalText(descriptor.source.remoteName, 'source remote name', MAX_CAPABILITY_URI_LENGTH)

    switch (descriptor.capabilityType) {
        case 'tool':
            assertJsonSchema(descriptor.inputSchema, 'tool input schema')
            if (descriptor.outputSchema) assertJsonSchema(descriptor.outputSchema, 'tool output schema')
            if (!MCP_TOOL_RISKS.includes(descriptor.behavior.risk)) invalid('tool risk is invalid')
            if (!MCP_TOOL_SIDE_EFFECTS.includes(descriptor.behavior.sideEffect)) invalid('tool side effect is invalid')
            if (!MCP_TOOL_IDEMPOTENCY.includes(descriptor.behavior.idempotency)) invalid('tool idempotency is invalid')
            if (descriptor.appResourceKey) assertIdentifier(descriptor.appResourceKey, 'tool app resource key')
            if (descriptor.taskMaxLifetimeMs !== undefined) {
                assertPositiveInteger(descriptor.taskMaxLifetimeMs, 'tool task maximum lifetime')
            }
            break
        case 'resource':
            assertResourceIdentifier(descriptor.uri, 'resource URI')
            assertOptionalText(descriptor.mimeType, 'resource MIME type', 500)
            if (descriptor.cacheTtlMs !== undefined) assertPositiveInteger(descriptor.cacheTtlMs, 'resource cache TTL')
            break
        case 'resource_template':
            assertResourceIdentifier(descriptor.uriTemplate, 'resource URI template')
            assertOptionalText(descriptor.mimeType, 'resource template MIME type', 500)
            assertJsonSchema(descriptor.argumentSchema, 'resource template argument schema')
            if (typeof descriptor.supportsCompletion !== 'boolean')
                invalid('resource template completion flag is invalid')
            if (descriptor.cacheTtlMs !== undefined) {
                assertPositiveInteger(descriptor.cacheTtlMs, 'resource template cache TTL')
            }
            break
        case 'prompt':
            assertIdentifier(descriptor.name, 'prompt name')
            assertJsonSchema(descriptor.argumentSchema, 'prompt argument schema')
            break
        case 'app':
            if (!descriptor.visibility.includes('app')) invalid('app visibility must include app')
            assertAppEntry(descriptor)
            assertCspDomains(descriptor.csp?.connectDomains, 'connect')
            assertCspDomains(descriptor.csp?.resourceDomains, 'resource')
            break
    }
}

function assertIdentifier(value: string, label: string) {
    if (
        typeof value !== 'string' ||
        !value ||
        value.length > MAX_CAPABILITY_KEY_LENGTH ||
        containsAsciiControl(value)
    ) {
        invalid(`${label} is invalid`)
    }
}

function assertOptionalText(value: string | undefined, label: string, maxLength: number) {
    if (value !== undefined && (typeof value !== 'string' || value.length > maxLength || containsNullOrDelete(value))) {
        invalid(`${label} is invalid`)
    }
}

function assertStringArray<const TValues extends readonly string[]>(
    values: readonly string[],
    allowed: TValues,
    label: string,
    requireValue = false
) {
    if (
        !Array.isArray(values) ||
        (requireValue && values.length === 0) ||
        values.length > allowed.length ||
        new Set(values).size !== values.length ||
        values.some((value) => !allowed.some((allowedValue) => allowedValue === value))
    ) {
        invalid(`${label} is invalid`)
    }
}

function assertJsonSchema(schema: McpJsonSchema, label: string) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) invalid(`${label} is invalid`)
    let serialized: string
    try {
        serialized = JSON.stringify(schema)
    } catch {
        invalid(`${label} is not serializable`)
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CAPABILITY_SCHEMA_BYTES) invalid(`${label} is too large`)
}

function assertPositiveInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value <= 0) invalid(`${label} is invalid`)
}

function assertResourceIdentifier(value: string, label: string) {
    if (
        typeof value !== 'string' ||
        !value ||
        value.length > MAX_CAPABILITY_URI_LENGTH ||
        containsAsciiWhitespaceOrControl(value) ||
        !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
    ) {
        invalid(`${label} is invalid`)
    }
}

function assertAppEntry(descriptor: McpAppCapabilityDescriptor) {
    const entry = descriptor.entry
    if (descriptor.source.serverName) {
        if (
            !entry.startsWith('ui://') ||
            entry.length > MAX_CAPABILITY_URI_LENGTH ||
            containsAsciiWhitespaceOrControl(entry)
        ) {
            invalid('remote app entry must be a ui:// resource URI')
        }
        return
    }
    const segments = entry.split('/')
    if (
        !descriptor.source.pluginName ||
        !entry.endsWith('.html') ||
        entry.startsWith('/') ||
        entry.includes('\\') ||
        segments.some((segment) => segment === '..' || segment === '.') ||
        entry.length > MAX_CAPABILITY_URI_LENGTH ||
        containsAsciiControl(entry)
    ) {
        invalid('plugin app entry must be a relative HTML path inside the plugin bundle')
    }
}

function assertCspDomains(domains: string[] | undefined, label: string) {
    if (!domains) return
    if (domains.length > MAX_APP_CSP_DOMAINS || new Set(domains).size !== domains.length) {
        invalid(`app ${label} CSP domains are invalid`)
    }
    for (const domain of domains) {
        let url: URL
        try {
            url = new URL(domain)
        } catch {
            invalid(`app ${label} CSP domain '${domain}' is invalid`)
        }
        const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
        const isSecureOrigin = url.protocol === 'https:' || url.protocol === 'wss:'
        if (
            !isSecureOrigin ||
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash ||
            url.origin !== domain.replace(/\/$/, '') ||
            hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local') ||
            isPrivateIpLiteral(hostname)
        ) {
            invalid(`app ${label} CSP domain '${domain}' must be an exact public HTTPS or WSS origin`)
        }
    }
}

function isPrivateIpLiteral(hostname: string) {
    const family = isIP(hostname)
    if (family === 4) {
        const [a, b] = hostname.split('.').map(Number)
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && (b === 0 || b === 168)) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        )
    }
    return family === 6 && (hostname === '::' || hostname === '::1' || /^(f[cd]|fe[89ab])/i.test(hostname))
}

function containsAsciiControl(value: string) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0)
        return code <= 31 || code === 127
    })
}

function containsAsciiWhitespaceOrControl(value: string) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0)
        return code <= 32 || code === 127
    })
}

function containsNullOrDelete(value: string) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0)
        return code === 0 || code === 127
    })
}

function invalid(reason: string): never {
    throw new Error(`Invalid MCP capability descriptor: ${reason}`)
}

export function hashMcpCapabilityDescriptor(descriptor: McpCapabilityDescriptor): string {
    return createHash('sha256')
        .update(canonicalJson(semanticDescriptor(descriptor)))
        .digest('hex')
}

export function compareMcpCapabilityDescriptors(
    previous: McpCapabilityDescriptor,
    current: McpCapabilityDescriptor
): McpCapabilityCompatibility {
    const changed = hashMcpCapabilityDescriptor(previous) !== hashMcpCapabilityDescriptor(current)
    if (!changed) {
        return { changed: false, breaking: false, reasons: [] }
    }

    const reasons: string[] = []
    if (previous.capabilityType !== current.capabilityType) {
        reasons.push('capability type changed')
        return { changed: true, breaking: true, reasons }
    }
    if (previous.capabilityKey !== current.capabilityKey) {
        reasons.push('capability key changed')
    }
    if (previous.providerInstructions !== current.providerInstructions) {
        reasons.push('provider instructions changed')
    }
    if (previous.source.pluginName !== current.source.pluginName) {
        reasons.push('capability plugin source changed')
    }
    if (
        previous.source.serverName !== current.source.serverName ||
        previous.source.remoteName !== current.source.remoteName
    ) {
        reasons.push('capability remote routing changed')
    }
    for (const requiredContext of current.requiredContext) {
        if (!previous.requiredContext.includes(requiredContext)) {
            reasons.push(`required context '${requiredContext}' was added`)
        }
    }
    for (const visibility of previous.visibility) {
        if (!current.visibility.includes(visibility)) {
            reasons.push(`visibility '${visibility}' was removed`)
        }
    }

    switch (previous.capabilityType) {
        case 'tool':
            if (current.capabilityType === 'tool') compareToolDescriptor(previous, current, reasons)
            break
        case 'resource':
            if (current.capabilityType === 'resource') {
                if (previous.uri !== current.uri) reasons.push('resource URI changed')
                if (previous.mimeType !== current.mimeType) reasons.push('resource MIME type changed')
            }
            break
        case 'resource_template':
            if (current.capabilityType === 'resource_template') {
                if (previous.uriTemplate !== current.uriTemplate) reasons.push('resource URI template changed')
                if (previous.mimeType !== current.mimeType) reasons.push('resource template MIME type changed')
                compareJsonSchema(
                    previous.argumentSchema,
                    current.argumentSchema,
                    'resource template arguments',
                    reasons
                )
                if (previous.supportsCompletion && !current.supportsCompletion) {
                    reasons.push('resource template completion was removed')
                }
            }
            break
        case 'prompt':
            if (current.capabilityType === 'prompt') {
                if (previous.name !== current.name) reasons.push('prompt public name changed')
                compareJsonSchema(previous.argumentSchema, current.argumentSchema, 'prompt arguments', reasons)
                if (previous.supportsCompletion && !current.supportsCompletion) {
                    reasons.push('prompt completion was removed')
                }
            }
            break
        case 'app':
            if (current.capabilityType === 'app') compareAppDescriptor(previous, current, reasons)
            break
    }

    return { changed: true, breaking: reasons.length > 0, reasons }
}

function compareToolDescriptor(
    previous: McpToolCapabilityDescriptor,
    current: McpToolCapabilityDescriptor,
    reasons: string[]
) {
    compareJsonSchema(previous.inputSchema, current.inputSchema, 'tool input', reasons)
    if (previous.outputSchema && current.outputSchema) {
        compareJsonSchema(previous.outputSchema, current.outputSchema, 'tool output', reasons)
    } else if (previous.outputSchema && !current.outputSchema) {
        reasons.push('tool output schema was removed')
    }

    if (rank(TOOL_RISK_ORDER, current.behavior.risk) > rank(TOOL_RISK_ORDER, previous.behavior.risk)) {
        reasons.push(`tool risk increased from '${previous.behavior.risk}' to '${current.behavior.risk}'`)
    }
    if (
        rank(TOOL_SIDE_EFFECT_ORDER, current.behavior.sideEffect) >
        rank(TOOL_SIDE_EFFECT_ORDER, previous.behavior.sideEffect)
    ) {
        reasons.push(
            `tool side effect increased from '${previous.behavior.sideEffect}' to '${current.behavior.sideEffect}'`
        )
    }
    if (
        rank(TOOL_IDEMPOTENCY_ORDER, current.behavior.idempotency) >
        rank(TOOL_IDEMPOTENCY_ORDER, previous.behavior.idempotency)
    ) {
        reasons.push(
            `tool idempotency weakened from '${previous.behavior.idempotency}' to '${current.behavior.idempotency}'`
        )
    }
    if (previous.appResourceKey !== current.appResourceKey) reasons.push('tool app binding changed')
    if (previous.taskMode !== 'required' && current.taskMode === 'required')
        reasons.push('tool now requires task execution')
    if (
        previous.taskMaxLifetimeMs !== undefined &&
        current.taskMaxLifetimeMs !== undefined &&
        current.taskMaxLifetimeMs < previous.taskMaxLifetimeMs
    ) {
        reasons.push('tool task maximum lifetime was reduced')
    }
}

function compareAppDescriptor(
    previous: McpAppCapabilityDescriptor,
    current: McpAppCapabilityDescriptor,
    reasons: string[]
) {
    if (previous.entry !== current.entry) reasons.push('app entry changed')
    for (const permission of ['clipboardWrite', 'camera', 'microphone', 'geolocation'] as const) {
        if (!previous.permissions?.[permission] && current.permissions?.[permission]) {
            reasons.push(`app permission '${permission}' was added`)
        }
    }
    for (const domain of current.csp?.connectDomains ?? []) {
        if (!previous.csp?.connectDomains?.includes(domain)) reasons.push(`app connect domain '${domain}' was added`)
    }
    for (const domain of current.csp?.resourceDomains ?? []) {
        if (!previous.csp?.resourceDomains?.includes(domain)) reasons.push(`app resource domain '${domain}' was added`)
    }
}

function compareJsonSchema(previous: McpJsonSchema, current: McpJsonSchema, path: string, reasons: string[]) {
    if (canonicalJson(previous) === canonicalJson(current)) return

    const previousProperties = jsonObject(previous.properties)
    const currentProperties = jsonObject(current.properties)
    if (!previousProperties || !currentProperties) {
        reasons.push(`${path} schema changed`)
        return
    }

    const previousRequired = stringSet(previous.required)
    const currentRequired = stringSet(current.required)
    for (const propertyName of Object.keys(previousProperties)) {
        const currentProperty = currentProperties[propertyName]
        if (currentProperty === undefined) {
            reasons.push(`${path} property '${propertyName}' was removed`)
            continue
        }
        const previousProperty = previousProperties[propertyName]
        const previousPropertySchema = jsonObject(previousProperty)
        const currentPropertySchema = jsonObject(currentProperty)
        if (!previousPropertySchema || !currentPropertySchema) {
            if (canonicalJson(previousProperty) !== canonicalJson(currentProperty)) {
                reasons.push(`${path} property '${propertyName}' changed`)
            }
            continue
        }
        compareJsonSchema(previousPropertySchema, currentPropertySchema, `${path}.${propertyName}`, reasons)
    }
    for (const requiredProperty of currentRequired) {
        if (!previousRequired.has(requiredProperty))
            reasons.push(`${path} property '${requiredProperty}' became required`)
    }

    const ignoredKeywords = new Set(['title', 'description', 'default', 'examples', 'properties', 'required'])
    const semanticKeywords = new Set([
        ...Object.keys(previous).filter((key) => !ignoredKeywords.has(key)),
        ...Object.keys(current).filter((key) => !ignoredKeywords.has(key))
    ])
    for (const keyword of semanticKeywords) {
        if (canonicalJson(previous[keyword] ?? null) !== canonicalJson(current[keyword] ?? null)) {
            reasons.push(`${path} keyword '${keyword}' changed`)
        }
    }
}

function semanticDescriptor(descriptor: McpCapabilityDescriptor): JSONValue {
    const value: JsonObject = {
        descriptorVersion: descriptor.descriptorVersion,
        capabilityType: descriptor.capabilityType,
        capabilityKey: descriptor.capabilityKey,
        requiredContext: [...descriptor.requiredContext],
        visibility: [...descriptor.visibility]
    }
    const source: JsonObject = {}
    if (descriptor.source.pluginName) source.pluginName = descriptor.source.pluginName
    if (descriptor.source.serverName) source.serverName = descriptor.source.serverName
    if (descriptor.source.remoteName) source.remoteName = descriptor.source.remoteName
    if (Object.keys(source).length) value.source = source
    if (descriptor.title !== undefined) value.title = descriptor.title
    if (descriptor.description !== undefined) value.description = descriptor.description
    if (descriptor.providerInstructions !== undefined) value.providerInstructions = descriptor.providerInstructions

    switch (descriptor.capabilityType) {
        case 'tool':
            value.inputSchema = descriptor.inputSchema
            if (descriptor.outputSchema) value.outputSchema = descriptor.outputSchema
            value.behavior = { ...descriptor.behavior }
            if (descriptor.annotations) value.annotations = toolAnnotations(descriptor)
            if (descriptor.appResourceKey) value.appResourceKey = descriptor.appResourceKey
            if (descriptor.taskMode) value.taskMode = descriptor.taskMode
            if (descriptor.taskMaxLifetimeMs !== undefined) value.taskMaxLifetimeMs = descriptor.taskMaxLifetimeMs
            break
        case 'resource':
            value.uri = descriptor.uri
            if (descriptor.mimeType) value.mimeType = descriptor.mimeType
            if (descriptor.cacheTtlMs !== undefined) value.cacheTtlMs = descriptor.cacheTtlMs
            break
        case 'resource_template':
            value.uriTemplate = descriptor.uriTemplate
            if (descriptor.mimeType) value.mimeType = descriptor.mimeType
            value.argumentSchema = descriptor.argumentSchema
            value.supportsCompletion = descriptor.supportsCompletion
            if (descriptor.cacheTtlMs !== undefined) value.cacheTtlMs = descriptor.cacheTtlMs
            break
        case 'prompt':
            value.name = descriptor.name
            value.argumentSchema = descriptor.argumentSchema
            if (descriptor.supportsCompletion !== undefined) value.supportsCompletion = descriptor.supportsCompletion
            break
        case 'app':
            value.entry = descriptor.entry
            if (descriptor.csp) value.csp = appCsp(descriptor)
            if (descriptor.permissions) value.permissions = appPermissions(descriptor)
            break
    }
    return value
}

function toolAnnotations(descriptor: McpToolCapabilityDescriptor): JsonObject {
    const value: JsonObject = {}
    const annotations = descriptor.annotations
    if (!annotations) return value
    if (annotations.title !== undefined) value.title = annotations.title
    if (annotations.readOnlyHint !== undefined) value.readOnlyHint = annotations.readOnlyHint
    if (annotations.destructiveHint !== undefined) value.destructiveHint = annotations.destructiveHint
    if (annotations.idempotentHint !== undefined) value.idempotentHint = annotations.idempotentHint
    if (annotations.openWorldHint !== undefined) value.openWorldHint = annotations.openWorldHint
    return value
}

function appCsp(descriptor: McpAppCapabilityDescriptor): JsonObject {
    const value: JsonObject = {}
    if (descriptor.csp?.connectDomains) value.connectDomains = [...descriptor.csp.connectDomains]
    if (descriptor.csp?.resourceDomains) value.resourceDomains = [...descriptor.csp.resourceDomains]
    return value
}

function appPermissions(descriptor: McpAppCapabilityDescriptor): JsonObject {
    const value: JsonObject = {}
    const permissions = descriptor.permissions
    if (!permissions) return value
    if (permissions.clipboardWrite !== undefined) value.clipboardWrite = permissions.clipboardWrite
    if (permissions.camera !== undefined) value.camera = permissions.camera
    if (permissions.microphone !== undefined) value.microphone = permissions.microphone
    if (permissions.geolocation !== undefined) value.geolocation = permissions.geolocation
    return value
}

function canonicalJson(value: JSONValue): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`
}

function jsonObject(value: JSONValue | undefined): JsonObject | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null
}

function stringSet(value: JSONValue | undefined): Set<string> {
    if (!Array.isArray(value)) return new Set()
    return new Set(value.filter((item): item is string => typeof item === 'string'))
}

function rank<const TValue extends readonly string[]>(values: TValue, value: TValue[number]): number {
    return values.indexOf(value)
}
