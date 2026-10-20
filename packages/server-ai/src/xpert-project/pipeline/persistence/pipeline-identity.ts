import { createHash } from 'node:crypto'
import type { ProjectPipelineJsonValue } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'

export function pipelineDigest(value: ProjectPipelineJsonValue): string {
    return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: ProjectPipelineJsonValue): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
    return `{${Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
        .join(',')}}`
}

export function pipelineIdentity(context: ProjectPipelineContext, kind: string, ...keys: string[]): string {
    const hex = pipelineDigest([
        context.actor.tenantId,
        context.actor.organizationId ?? null,
        context.projectId,
        kind,
        ...keys
    ])
    // UUID v8: application-specific SHA-256 identity, never a UUID v5/SHA-1 claim.
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
