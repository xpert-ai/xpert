import { z } from 'zod/v3'
import { projectPipelineConfigurationSchema, type ProjectPipelineConfiguration } from './configuration.schema'
import { projectPipelineJsonSchema, projectPipelineKeySchema, projectPipelineRefSchema } from './primitives.schema'
import { projectPipelineHostCapabilitiesSchema } from './compatibility.schema'
import { projectPipelineNativeModelBudgetSchema } from './budget.schema'

const label = z.object({ en_US: z.string().min(1).max(200), zh_Hans: z.string().min(1).max(200).optional() }).strict()
const field = { key: projectPipelineKeySchema, label, description: label.optional() }
const option = z.object({ value: z.string().min(1).max(200), label }).strict()
export const projectPipelineParameterFieldSchema = z.discriminatedUnion('type', [
  z.object({ ...field, type: z.literal('boolean') }).strict(),
  z
    .object({
      ...field,
      type: z.literal('text'),
      maxLength: z.number().int().min(1).max(4000),
      minLength: z.number().int().min(0).max(4000)
    })
    .strict(),
  z
    .object({
      ...field,
      type: z.literal('number'),
      min: z.number().finite(),
      max: z.number().finite(),
      integer: z.boolean()
    })
    .strict(),
  z.object({ ...field, type: z.literal('choice'), options: z.array(option).min(1).max(100) }).strict(),
  z
    .object({
      ...field,
      type: z.literal('multi_choice'),
      options: z.array(option).min(1).max(100),
      minItems: z.number().int().min(0).max(100).default(0)
    })
    .strict(),
  z
    .object({
      ...field,
      type: z.literal('string_list'),
      maxItems: z.number().int().min(1).max(100),
      itemMaxLength: z.number().int().min(1).max(500)
    })
    .strict()
])
export const projectPipelineConfigurationFormSchema = z
  .object({
    templateRef: projectPipelineRefSchema,
    description: label,
    assistantSlots: z
      .array(z.object({ slot: projectPipelineKeySchema, label, description: label.optional() }).strict())
      .max(100),
    runtimeSlots: z
      .array(z.object({ slot: projectPipelineKeySchema, label, description: label.optional() }).strict())
      .max(100)
      .optional(),
    /** Optional maxima for the three editable admission values; not an execution budget by itself. */
    nativeModelBudget: projectPipelineNativeModelBudgetSchema.optional(),
    parameters: z.array(projectPipelineParameterFieldSchema).max(100)
  })
  .strict()
  .superRefine((form, context) => {
    for (const [path, keys] of [
      ['assistantSlots', [...form.assistantSlots, ...(form.runtimeSlots ?? [])].map((item) => item.slot)],
      ['parameters', form.parameters.map((item) => item.key)]
    ] as const) {
      if (new Set(keys).size !== keys.length)
        context.addIssue({ code: 'custom', message: 'DUPLICATE_CONFIGURATION_FIELD', path: [path] })
    }
    form.parameters.forEach((item, index) => {
      if (
        (item.type === 'number' && item.min > item.max) ||
        (item.type === 'text' && item.minLength > item.maxLength) ||
        (item.type === 'multi_choice' && item.minItems > item.options.length) ||
        ((item.type === 'choice' || item.type === 'multi_choice') &&
          new Set(item.options.map((option) => option.value)).size !== item.options.length)
      )
        context.addIssue({ code: 'custom', message: 'INVALID_CONFIGURATION_FIELD', path: ['parameters', index] })
    })
  })
export type ProjectPipelineConfigurationForm = z.output<typeof projectPipelineConfigurationFormSchema>
export type ProjectPipelineParameterField = z.output<typeof projectPipelineParameterFieldSchema>

export const projectPipelineRuntimeSelectionSchema = z
  .object({ bindingId: z.string().uuid(), workspaceId: z.string().uuid() })
  .strict()
export type ProjectPipelineRuntimeSelection = z.output<typeof projectPipelineRuntimeSelectionSchema>
export const projectPipelineCatalogConfigureSchema = z
  .object({
    requestId: z.string().uuid(),
    contributionKey: projectPipelineKeySchema,
    templateRef: projectPipelineRefSchema,
    assistants: z.record(projectPipelineKeySchema, z.string().uuid()),
    runtimes: z.record(projectPipelineKeySchema, projectPipelineRuntimeSelectionSchema).optional(),
    nativeModelBudget: projectPipelineNativeModelBudgetSchema.optional(),
    parameters: z.record(projectPipelineKeySchema, projectPipelineJsonSchema)
  })
  .strict()
export type ProjectPipelineCatalogConfigure = z.output<typeof projectPipelineCatalogConfigureSchema>
/** Catalog wire format; independent of the definition's execution protocol requirements. */
export const projectPipelineCatalogProtocolSchema = z.union([z.literal(1), z.literal(2)])
export const projectPipelineCatalogRequestSchema = z
  .object({ protocol: projectPipelineCatalogProtocolSchema.optional() })
  .strict()
export type ProjectPipelineCatalogRequest = z.output<typeof projectPipelineCatalogRequestSchema>
export function canReadProjectPipelineConfiguration(
  configuration: ProjectPipelineConfiguration,
  request: ProjectPipelineCatalogRequest,
  form?: ProjectPipelineConfigurationForm
): boolean {
  if (request.protocol === undefined && configuration.template.hostRequirements) return false
  return request.protocol === 2 || !(configuration.binding.limits?.nativeModelBudget || form?.nativeModelBudget)
}
export const projectPipelineCatalogSchema = z
  .object({
    hostCapabilities: projectPipelineHostCapabilitiesSchema.optional(),
    canManage: z.boolean(),
    items: z.array(
      z
        .object({
          contributionKey: projectPipelineKeySchema,
          configuration: projectPipelineConfigurationSchema,
          form: projectPipelineConfigurationFormSchema.optional()
        })
        .strict()
    ),
    assistants: z.array(z.object({ id: z.string().uuid(), name: z.string(), publishedVersion: z.string() }).strict()),
    runtimeBindings: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            title: z.string(),
            provider: z.string(),
            revision: z.string(),
            workspaces: z
              .array(z.object({ id: z.string().uuid(), name: z.string() }).strict())
              .min(1)
              .max(100)
          })
          .strict()
      )
      .optional()
  })
  .strict()
export type ProjectPipelineCatalog = z.output<typeof projectPipelineCatalogSchema>

export const projectPipelineSavedConfigurationSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    configuration: projectPipelineConfigurationSchema
  })
  .strict()
export type ProjectPipelineSavedConfiguration = z.output<typeof projectPipelineSavedConfigurationSchema>
export const projectPipelineConfigurationPageSchema = z
  .object({ items: z.array(projectPipelineSavedConfigurationSchema), next: z.string().uuid().nullable() })
  .strict()

function parameterSchema(field: ProjectPipelineParameterField) {
  switch (field.type) {
    case 'boolean':
      return z.boolean()
    case 'text':
      return z.string().min(field.minLength).max(field.maxLength)
    case 'number':
      return (field.integer ? z.number().int() : z.number()).finite().min(field.min).max(field.max)
    case 'choice':
      return z.string().refine((value) => field.options.some((option) => option.value === value))
    case 'multi_choice':
      return z
        .array(z.string())
        .min(field.minItems)
        .max(field.options.length)
        .refine(
          (values) =>
            new Set(values).size === values.length &&
            values.every((value) => field.options.some((option) => option.value === value))
        )
    case 'string_list':
      return z.array(z.string().min(1).max(field.itemMaxLength)).max(field.maxItems)
  }
}

/** Strict allowlist shared by saved configuration and provider action forms. */
export function parseProjectPipelineParameters(
  fields: readonly ProjectPipelineParameterField[],
  values: Record<string, import('./primitives.schema').ProjectPipelineJsonValue>
) {
  if (
    fields.some(
      (item) =>
        (item.type === 'number' && item.min > item.max) ||
        (item.type === 'text' && item.minLength > item.maxLength) ||
        (item.type === 'multi_choice' && item.minItems > item.options.length) ||
        ((item.type === 'choice' || item.type === 'multi_choice') &&
          new Set(item.options.map((option) => option.value)).size !== item.options.length)
    )
  )
    throw new Error('PIPELINE_CONFIGURATION_FIELD_INVALID')
  const keys = fields.map((field) => field.key)
  if (
    new Set(keys).size !== keys.length ||
    Object.keys(values).length !== keys.length ||
    Object.keys(values).some((key) => !keys.includes(key))
  )
    throw new Error('PIPELINE_CONFIGURATION_FIELDS_MISMATCH')
  return Object.fromEntries(fields.map((field) => [field.key, parameterSchema(field).parse(values[field.key])]))
}

/** Expose only declared fields; immutable topology, selectors and undisclosed defaults stay server-owned. */
export function configureProjectPipelineFromForm(
  configuration: ProjectPipelineConfiguration,
  form: ProjectPipelineConfigurationForm,
  input: Pick<ProjectPipelineCatalogConfigure, 'assistants' | 'runtimes' | 'parameters' | 'nativeModelBudget'>
): ProjectPipelineConfiguration {
  if (
    form.templateRef !== configuration.binding.templateRef ||
    configuration.template.executionAuthority !== 'platform'
  )
    throw new Error('PIPELINE_CONFIGURATION_FORM_MISMATCH')
  const sameKeys = (actual: string[], expected: string[]) =>
    actual.length === expected.length && actual.every((key) => expected.includes(key))
  if (
    !sameKeys(
      form.assistantSlots.map((item) => item.slot),
      Object.entries(configuration.binding.executorBindings ?? {})
        .filter(([, executor]) => executor.kind === 'assistant')
        .map(([slot]) => slot)
    )
  )
    throw new Error('PIPELINE_CONFIGURATION_SLOTS_INCOMPLETE')
  const runtimeSlots = form.runtimeSlots ?? [],
    runtimes = input.runtimes ?? {}
  if (
    !sameKeys(
      runtimeSlots.map((item) => item.slot),
      Object.entries(configuration.binding.executorBindings ?? {})
        .filter(([, executor]) => executor.kind === 'runtime_binding')
        .map(([slot]) => slot)
    )
  )
    throw new Error('PIPELINE_CONFIGURATION_SLOTS_INCOMPLETE')
  if (
    !sameKeys(
      Object.keys(input.assistants),
      form.assistantSlots.map((item) => item.slot)
    ) ||
    !sameKeys(
      Object.keys(runtimes),
      runtimeSlots.map((item) => item.slot)
    ) ||
    !sameKeys(
      Object.keys(input.parameters),
      form.parameters.map((item) => item.key)
    )
  )
    throw new Error('PIPELINE_CONFIGURATION_FIELDS_MISMATCH')
  const binding = {
    ...configuration.binding,
    parameters: { ...configuration.binding.parameters },
    executorBindings: Object.fromEntries(
      Object.entries(configuration.binding.executorBindings ?? {}).map(([key, executor]) => [key, { ...executor }])
    )
  }
  if (form.nativeModelBudget) {
    if (!binding.limits?.nativeModelBudget) throw new Error('PIPELINE_CONFIGURATION_BUDGET_DEFAULT_REQUIRED')
    const budget = projectPipelineNativeModelBudgetSchema.parse(input.nativeModelBudget)
    for (const key of ['maxCalls', 'maxTokens', 'reservationTokens'] as const)
      if (budget[key] > form.nativeModelBudget[key]) throw new Error('PIPELINE_CONFIGURATION_BUDGET_LIMIT')
    binding.limits = { ...binding.limits, nativeModelBudget: budget }
  } else if (input.nativeModelBudget !== undefined) throw new Error('PIPELINE_CONFIGURATION_FIELDS_MISMATCH')
  for (const item of form.assistantSlots) {
    const executor = binding.executorBindings?.[item.slot]
    if (!executor || executor.kind !== 'assistant') throw new Error('PIPELINE_CONFIGURATION_SLOT_MISMATCH')
    executor.selectionKey = z.string().uuid().parse(input.assistants[item.slot])
  }
  for (const item of runtimeSlots) {
    const executor = binding.executorBindings[item.slot]
    if (!executor || executor.kind !== 'runtime_binding') throw new Error('PIPELINE_CONFIGURATION_SLOT_MISMATCH')
    const selection = projectPipelineRuntimeSelectionSchema.parse(runtimes[item.slot])
    executor.selectionKey = selection.bindingId
    executor.workspaceId = selection.workspaceId
  }
  for (const field of form.parameters) {
    if (!Object.prototype.hasOwnProperty.call(binding.parameters, field.key))
      throw new Error('PIPELINE_CONFIGURATION_PARAMETER_MISSING')
    binding.parameters[field.key] = parameterSchema(field).parse(input.parameters[field.key])
  }
  return projectPipelineConfigurationSchema.parse({ ...configuration, binding })
}

/** Registration validates defaults without requiring portable Assistant placeholders to be UUIDs. */
export function validateProjectPipelineConfigurationForm(
  configuration: ProjectPipelineConfiguration,
  form: ProjectPipelineConfigurationForm
) {
  return configureProjectPipelineFromForm(configuration, form, {
    ...(form.nativeModelBudget ? { nativeModelBudget: configuration.binding.limits?.nativeModelBudget } : {}),
    assistants: Object.fromEntries(
      form.assistantSlots.map((item) => [item.slot, '00000000-0000-4000-8000-000000000001'])
    ),
    runtimes: Object.fromEntries(
      (form.runtimeSlots ?? []).map((item) => [
        item.slot,
        {
          bindingId: '00000000-0000-4000-8000-000000000001',
          workspaceId: '00000000-0000-4000-8000-000000000002'
        }
      ])
    ),
    parameters: Object.fromEntries(
      form.parameters.map((item) => [item.key, configuration.binding.parameters[item.key]])
    )
  })
}
