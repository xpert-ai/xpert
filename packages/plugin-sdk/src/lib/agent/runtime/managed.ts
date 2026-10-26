import { z } from 'zod/v3'
import { createRuntimeCapability } from '../../core/runtime-capability'

/** Adapter declarations are discoverability metadata, never an execution grant. */
export interface ManagedAgentRuntimeProfile {
  reference: string
  version: string
  title: string
  toolName: string
  description: string
  environment: 'computer' | 'process' | 'sdk' | 'service'
}

export interface ManagedAgentRuntimeSelection {
  provider: string
  reference: string
}

export interface ManagedAgentRuntimeOption extends ManagedAgentRuntimeSelection {
  title: string
  toolName: string
  description: string
}

/** Persisted host ownership marker. Only built-in presets are supported. */
export const managedAgentRuntimeSchema = z
  .object({
    type: z.literal('builtin'),
    version: z.string().min(1)
  })
  .strict()

/** Launch settings supplied by the installed strategy, never by tool input or host provider lists. */
export const agentRuntimeDeploymentSpecSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('process'),
      command: z
        .string()
        .min(1)
        .refine((value) => !value.includes('\0')),
      args: z.array(z.string().refine((value) => !value.includes('\0'))),
      environment: z.record(z.string(), z.string()),
      model: z.string().min(1).optional(),
      timeoutMs: z.number().int().min(1000).max(3600000)
    })
    .strict(),
  z
    .object({
      type: z.literal('sdk'),
      environment: z.record(z.string(), z.string()),
      model: z.string().min(1).optional(),
      timeoutMs: z.number().int().min(1000).max(3600000)
    })
    .strict(),
  z
    .object({
      type: z.literal('service'),
      serverUrl: z
        .string()
        .url()
        .refine((value) => {
          try {
            const url = new URL(value)
            return (
              ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
            )
          } catch {
            return false
          }
        }),
      authorization: z.string().optional(),
      timeoutMs: z.number().int().min(1000).max(3600000)
    })
    .strict()
])
export type AgentRuntimeDeploymentSpec = z.infer<typeof agentRuntimeDeploymentSpecSchema>

/** Ephemeral launch settings scoped by the host. Only the fingerprint enters persisted targets. */
export type AgentRuntimeDeployment = AgentRuntimeDeploymentSpec & {
  provider: string
  revision: string
  workspaceRoot: string
}

/** Used by SDK/process/service adapters. The host pins the target and rechecks access; no caller-selected scope. */
export const AgentRuntimeDeploymentCapability = createRuntimeCapability<{
  resolve(): Promise<AgentRuntimeDeployment>
}>('platform.agent_runtime.deployment')
