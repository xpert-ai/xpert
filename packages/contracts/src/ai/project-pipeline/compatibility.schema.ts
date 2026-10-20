import { z } from 'zod/v3'
import { projectPipelineKeySchema } from './primitives.schema'

const version = z.number().int().min(1).max(1000)
const versions = z
  .array(version)
  .min(1)
  .max(20)
  .refine((values) => new Set(values).size === values.length)
const bounded = <T extends z.ZodTypeAny>(value: T) =>
  z.record(projectPipelineKeySchema, value).refine((values) => Object.keys(values).length <= 100)

/** Feature versions are exact protocols, not package semver or an implicit minimum version. */
export const projectPipelineHostRequirementsSchema = z
  .object({
    protocol: version,
    features: bounded(version)
  })
  .strict()
export const projectPipelineHostCapabilitiesSchema = z
  .object({
    protocols: versions,
    features: bounded(versions)
  })
  .strict()
export type ProjectPipelineHostRequirements = z.output<typeof projectPipelineHostRequirementsSchema>
export type ProjectPipelineHostCapabilities = z.output<typeof projectPipelineHostCapabilitiesSchema>
export interface ProjectPipelineCompatibilityIssue {
  code: 'HOST_PROTOCOL_UNSUPPORTED' | 'HOST_FEATURE_UNSUPPORTED'
  path: Array<string | number>
  ref?: string
}
