import { z } from 'zod/v3'
import { projectPipelineEvidenceRefSchema } from './runtime.schema'

/** Portable node contract. Only the host executes installation; plugins supply immutable inputs. */
export const projectPluginDeploymentRefs = {
  operation: 'platform.plugin-deployment@1',
  request: 'platform.plugin-deployment-request@1',
  receipt: 'platform.plugin-deployment-receipt@1',
  evidence: 'platform.plugin-deployment-evidence@1'
} as const

export const projectPluginDeploymentRequestSchema = z.object({
  target: z.literal('current-instance'),
  artifactId: z.string().uuid(), artifactVersionId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().min(1).max(240).regex(/^[^/\\\u0000]+$/),
  packageName: z.string().min(1).max(240), packageVersion: z.string().min(1).max(80),
  allowReplace: z.boolean(), allowRestart: z.boolean()
}).strict()

export const projectPluginDeploymentReceiptSchema = z.object({
  operationId: z.string().uuid(),
  request: projectPluginDeploymentRequestSchema,
  approval: projectPipelineEvidenceRefSchema,
  scopeKey: z.string().min(1), runtimeRevision: z.string().min(1),
  installed: z.literal(true), loaded: z.literal(true)
}).strict()

export type ProjectPluginDeploymentRequest = z.output<typeof projectPluginDeploymentRequestSchema>
export type ProjectPluginDeploymentReceipt = z.output<typeof projectPluginDeploymentReceiptSchema>
