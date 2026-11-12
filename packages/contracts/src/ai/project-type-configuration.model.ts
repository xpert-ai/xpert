import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from './types'
import type { XpertProjectTypeRef } from './xpert-project-type.model'

export type ProjectConfigurationValue = string | number | boolean | null |
  ProjectConfigurationValue[] | { [key: string]: ProjectConfigurationValue }
export type ProjectConfigurationValues = { [key: string]: ProjectConfigurationValue }

const valueSchema: z.ZodType<ProjectConfigurationValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(valueSchema), z.record(valueSchema)
]))
export const projectConfigurationValuesSchema = z.record(valueSchema).refine(
  (values) => JSON.stringify(values).length <= 65536, 'Project configuration is too large'
)
export const projectConfigurationUpdateSchema = z.object({
  revision: z.number().int().nonnegative(),
  values: projectConfigurationValuesSchema
}).strict()
export type ProjectConfigurationUpdate = z.output<typeof projectConfigurationUpdateSchema>

/** Non-secret, type-defined settings. JSON Schema defaults are applied by the host. */
export interface XpertProjectTypeConfigurationDefinition {
  schema: JsonSchemaObjectType
}

export interface ProjectTaskDurationConfiguration {
  projectType: XpertProjectTypeRef
  configurationRevision: number
  /** Absent preserves the tenant's default duration. */
  maxDurationSeconds?: number
}

export interface XpertProjectConfigurationView {
  projectType: XpertProjectTypeRef
  revision: number
  schema?: JsonSchemaObjectType
  values: ProjectConfigurationValues
  effectiveValues: ProjectConfigurationValues
  canEdit: boolean
  taskExecution: {
    configuredMaxDurationSeconds?: number
    defaultDurationSeconds: number
    tenantMaxDurationSeconds: number
    effectiveMaxDurationSeconds: number
  }
}

/** Reserved host setting; custom type settings remain uninterpreted by the runtime. */
export const projectTaskDurationSchema = z.number().int().min(60).max(86400)

export function projectTaskConfigurationSchema(defaultSeconds?: number): JsonSchemaObjectType {
  return {
    type: 'object', additionalProperties: false,
    properties: {
      taskExecutionMaxDurationSeconds: {
        type: 'integer', minimum: 60, maximum: 86400,
        ...(defaultSeconds === undefined ? {} : { default: defaultSeconds }),
        title: { en_US: 'Task execution limit (seconds)', zh_Hans: '单次任务执行上限（秒）' },
        description: {
          en_US: '7200 seconds is 2 hours. Applies to new implementation and review attempts, within the tenant limit.',
          zh_Hans: '7200 秒为 2 小时。在租户允许的上限内，对新的开发和验收执行生效。'
        }
      }
    }
  }
}
