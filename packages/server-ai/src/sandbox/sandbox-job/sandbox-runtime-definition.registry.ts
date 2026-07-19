import { Injectable } from '@nestjs/common'
import type {
    SandboxRuntimeDefinition,
    SandboxRuntimeNetworkPolicy,
    SandboxRuntimeProviderCapabilities,
    SandboxRuntimeResources,
    SandboxRuntimeSecurity
} from '@xpert-ai/plugin-sdk'
import browserDefinition from './runtime-definitions/browser-playwright-1.61-v1.json'
import browserAiDefinition from './runtime-definitions/browser-ai-playwright-1.61-v1.json'
import browserVideoDefinition from './runtime-definitions/browser-video-playwright-1.61-v1.json'

/** Stable Browser Runtime profile embedded in the provider-neutral OSS Core catalog. */
export const DEFAULT_BROWSER_RUNTIME_PROFILE = 'browser/playwright-1.61/v1'
/** Generic browser runtime with pinned, offline AI resources. */
export const AI_BROWSER_RUNTIME_PROFILE = 'browser/ai-playwright-1.61/v1'
/** Production media profile with Node 22, matching Chromium and FFmpeg. */
export const VIDEO_BROWSER_RUNTIME_PROFILE = 'browser/video-playwright-1.61/v1'

/**
 * Loads and validates trusted Runtime Definitions embedded in OSS Core.
 *
 * Runtime Suite release tooling consumes the same catalog when producing image
 * metadata, so API processes never install the image-build package.
 */
@Injectable()
export class SandboxRuntimeDefinitionRegistry {
    private readonly definitions = new Map<string, SandboxRuntimeDefinition>()

    constructor() {
        this.register(parseDefinition(browserDefinition, 'Browser Runtime Definition'))
        this.register(parseDefinition(browserAiDefinition, 'Browser AI Runtime Definition'))
        this.register(parseDefinition(browserVideoDefinition, 'Browser Video Runtime Definition'))
    }

    /** Returns a registered provider-neutral Definition without probing execution infrastructure. */
    get(name: string): SandboxRuntimeDefinition | null {
        return this.definitions.get(name) ?? null
    }

    /** Returns a Definition or fails fast when the Runtime Suite is incomplete. */
    require(name: string): SandboxRuntimeDefinition {
        const definition = this.get(name)
        if (!definition) throw new Error(`Sandbox Runtime Definition is not registered: ${name}`)
        return definition
    }

    /** Lists immutable Definitions used by Worker health probes and Action resolution. */
    list(): SandboxRuntimeDefinition[] {
        return Array.from(this.definitions.values())
    }

    private register(definition: SandboxRuntimeDefinition): void {
        if (this.definitions.has(definition.name)) {
            throw new Error(`Duplicate Sandbox Runtime Definition: ${definition.name}`)
        }
        this.definitions.set(definition.name, definition)
    }
}

function parseDefinition(value: unknown, source: string): SandboxRuntimeDefinition {
    const definition = objectValue(value, source)
    onlyKeys(
        definition,
        [
            'name',
            'command',
            'contractVersion',
            'sandboxRuntimeVersion',
            'timeoutMs',
            'hardDeadlineMs',
            'resources',
            'networkPolicy',
            'security',
            'requirements',
            'expectedManifest'
        ],
        source
    )
    const name = stringValue(definition.name, `${source}.name`)
    const contractVersion = stringValue(definition.contractVersion, `${source}.contractVersion`)
    const sandboxRuntimeVersion = stringValue(definition.sandboxRuntimeVersion, `${source}.sandboxRuntimeVersion`)
    const timeoutMs = positiveInteger(definition.timeoutMs, `${source}.timeoutMs`)
    const hardDeadlineMs = positiveInteger(definition.hardDeadlineMs, `${source}.hardDeadlineMs`)
    if (timeoutMs > hardDeadlineMs) throw new Error(`${source}.timeoutMs cannot exceed hardDeadlineMs.`)
    const expectedManifest = stringRecord(definition.expectedManifest, `${source}.expectedManifest`)
    requireManifestValue(expectedManifest, 'profileName', name, source)
    requireManifestValue(expectedManifest, 'contractVersion', contractVersion, source)
    requireManifestValue(expectedManifest, 'sandboxRuntimeVersion', sandboxRuntimeVersion, source)
    return {
        name,
        command: commandValue(definition.command, `${source}.command`),
        contractVersion,
        sandboxRuntimeVersion,
        timeoutMs,
        hardDeadlineMs,
        resources: parseResources(definition.resources, source),
        networkPolicy: parseNetworkPolicy(definition.networkPolicy, source),
        security: parseSecurity(definition.security, source),
        requirements: parseRequirements(definition.requirements, source),
        expectedManifest
    }
}

function parseResources(value: unknown, source: string): SandboxRuntimeResources {
    const resources = objectValue(value, `${source}.resources`)
    onlyKeys(resources, ['cpu', 'memoryMb', 'shmSizeMb', 'tempDiskMb'], `${source}.resources`)
    return {
        cpu: positiveNumber(resources.cpu, `${source}.resources.cpu`),
        memoryMb: positiveInteger(resources.memoryMb, `${source}.resources.memoryMb`),
        shmSizeMb: positiveInteger(resources.shmSizeMb, `${source}.resources.shmSizeMb`),
        tempDiskMb: positiveInteger(resources.tempDiskMb, `${source}.resources.tempDiskMb`)
    }
}

function parseNetworkPolicy(value: unknown, source: string): SandboxRuntimeNetworkPolicy {
    const policy = objectValue(value, `${source}.networkPolicy`)
    onlyKeys(policy, ['mode', 'allowedHosts'], `${source}.networkPolicy`)
    if (policy.mode !== 'none' && policy.mode !== 'internal-only') {
        throw new Error(`${source}.networkPolicy.mode is invalid.`)
    }
    const allowedHosts =
        policy.allowedHosts === undefined
            ? undefined
            : stringArray(policy.allowedHosts, `${source}.networkPolicy.allowedHosts`)
    if (policy.mode === 'none' && allowedHosts?.length) {
        throw new Error(`${source}.networkPolicy.allowedHosts requires internal-only mode.`)
    }
    return { mode: policy.mode, ...(allowedHosts ? { allowedHosts } : {}) }
}

function parseSecurity(value: unknown, source: string): SandboxRuntimeSecurity {
    const security = objectValue(value, `${source}.security`)
    onlyKeys(
        security,
        ['runAsNonRoot', 'readOnlyRootFilesystem', 'noNewPrivileges', 'dropCapabilities'],
        `${source}.security`
    )
    if (
        security.runAsNonRoot !== true ||
        security.readOnlyRootFilesystem !== true ||
        security.noNewPrivileges !== true ||
        security.dropCapabilities !== 'all'
    ) {
        throw new Error(`${source}.security must require the hardened Sandbox policy.`)
    }
    return {
        runAsNonRoot: true,
        readOnlyRootFilesystem: true,
        noNewPrivileges: true,
        dropCapabilities: 'all'
    }
}

function parseRequirements(value: unknown, source: string): SandboxRuntimeProviderCapabilities {
    const requirements = objectValue(value, `${source}.requirements`)
    onlyKeys(
        requirements,
        ['isolation', 'ephemeral', 'resourceLimits', 'networkPolicy', 'readOnlyRootFilesystem'],
        `${source}.requirements`
    )
    if (requirements.isolation !== 'process' && requirements.isolation !== 'hardened') {
        throw new Error(`${source}.requirements.isolation is invalid.`)
    }
    return {
        isolation: requirements.isolation,
        ephemeral: booleanValue(requirements.ephemeral, `${source}.requirements.ephemeral`),
        resourceLimits: booleanValue(requirements.resourceLimits, `${source}.requirements.resourceLimits`),
        networkPolicy: booleanValue(requirements.networkPolicy, `${source}.requirements.networkPolicy`),
        readOnlyRootFilesystem: booleanValue(
            requirements.readOnlyRootFilesystem,
            `${source}.requirements.readOnlyRootFilesystem`
        )
    }
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`)
    return Object.fromEntries(Object.entries(value))
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
    if (unexpected.length) throw new Error(`${field} has unsupported fields: ${unexpected.join(', ')}.`)
}

function stringValue(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`)
    return value.trim()
}

function commandValue(value: unknown, field: string): string[] {
    const command = stringArray(value, field)
    if (!command.length) throw new Error(`${field} must not be empty.`)
    return command
}

function stringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) throw new Error(`${field} must be an array.`)
    return value.map((item, index) => stringValue(item, `${field}[${index}]`))
}

function stringRecord(value: unknown, field: string): Record<string, string> {
    const record = objectValue(value, field)
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, stringValue(item, `${field}.${key}`)]))
}

function positiveNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${field} must be a positive number.`)
    }
    return value
}

function positiveInteger(value: unknown, field: string): number {
    const result = positiveNumber(value, field)
    if (!Number.isInteger(result)) throw new Error(`${field} must be an integer.`)
    return result
}

function booleanValue(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`)
    return value
}

function requireManifestValue(manifest: Record<string, string>, key: string, expected: string, source: string): void {
    if (manifest[key] !== expected) throw new Error(`${source}.expectedManifest.${key} must be ${expected}.`)
}
