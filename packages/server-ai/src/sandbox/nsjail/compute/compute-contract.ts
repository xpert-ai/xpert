import { SandboxJobRuntimeError } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { getNsjailMessage } from '../nsjail-i18n'
import type { NsjailRunnerConfig } from '../nsjail.types'

export const NSJAIL_COMPUTE_PROVIDER = 'nsjail-compute'
export const NSJAIL_COMPUTE_VERSION = '1.0.0'
export const NSJAIL_COMPUTE_BINDING = 'nsjail-compute:node-python-v1'
export const COMPUTE_OUTPUT_LIMIT = 4 * 1024 * 1024

export const executionResultSchema = z
    .object({
        output: z.string(),
        exitCode: z.number().int().nullable(),
        truncated: z.boolean(),
        timedOut: z.boolean(),
        terminationReason: z.enum(['oom', 'deadline', 'cancelled', 'runtime-died']).optional()
    })
    .strict()

export const streamEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('output'), text: z.string() }).strict(),
    z.object({ type: z.literal('result'), result: executionResultSchema }).strict()
])

const fileError = z.enum(['file_not_found', 'permission_denied', 'is_directory', 'invalid_path']).nullable()
export const uploadResultSchema = z.array(z.object({ path: z.string(), error: fileError }).strict())
export const downloadResultSchema = z.array(
    z
        .object({
            path: z.string(),
            error: fileError,
            contentBase64: z
                .string()
                .max(44 * 1024 * 1024)
                .regex(/^[A-Za-z0-9+/]*={0,2}$/)
                .refine((value) => value.length % 4 === 0)
                .nullable()
        })
        .strict()
)
export const healthSchema = z
    .object({
        protocolVersion: z.literal(1),
        available: z.boolean(),
        manifest: z.record(z.string()).optional(),
        definition: z.unknown().optional(),
        reason: z.string().optional()
    })
    .strict()

export function computeUnavailable(capacity = false): SandboxJobRuntimeError {
    return new SandboxJobRuntimeError(
        capacity ? 'SANDBOX_CAPACITY_UNAVAILABLE' : 'SANDBOX_START_FAILED',
        getNsjailMessage(
            'NsJailComputeUnavailable',
            'NsJail Compute is unavailable. Check the Runner version, connection and cgroup v2 isolation.'
        ),
        true
    )
}

export function invalidComputePolicy(): Error {
    return new Error(
        getNsjailMessage(
            'NsJailComputeInvalidPolicy',
            'The NsJail Compute request does not match the supported runtime policy.'
        )
    )
}

/** Configuration is optional and read lazily; unconfigured OSS installations still start normally. */
export function computeConfig(): NsjailRunnerConfig | null {
    const baseUrl = process.env.NSJAIL_RUNNER_URL?.trim().replace(/\/+$/, '')
    const token = process.env.NSJAIL_RUNNER_TOKEN?.trim()
    if (!baseUrl || !token) return null
    try {
        const url = new URL(baseUrl)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            return null
        return { baseUrl, token }
    } catch {
        return null
    }
}
