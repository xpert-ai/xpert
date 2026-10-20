import { z } from 'zod/v3'
import { projectPipelineDefinitionSchema } from './definition.schema'
import { projectPipelineNativeModelBudgetSchema } from './budget.schema'
import {
  projectPipelineJsonSchema,
  projectPipelineKeySchema,
  projectPipelineParticipantKindSchema,
  projectPipelineRefSchema
} from './primitives.schema'

const participantSelection = z
  .object({
    kind: projectPipelineParticipantKindSchema,
    selectionKey: projectPipelineKeySchema,
    requiredCapabilities: z.array(projectPipelineKeySchema).max(100).optional()
  })
  .strict()

export const projectPipelineBindingSchema = z
  .object({
    templateRef: projectPipelineRefSchema,
    roleBindings: z.record(projectPipelineKeySchema, participantSelection),
    executorBindings: z
      .record(
        projectPipelineKeySchema,
        participantSelection
          .extend({ roleKey: projectPipelineKeySchema, workspaceId: z.string().uuid().optional() })
          .superRefine((executor, context) => {
            if (executor.workspaceId && executor.kind !== 'runtime_binding')
              context.addIssue({ code: 'custom', message: 'RUNTIME_WORKSPACE_ONLY', path: ['workspaceId'] })
          })
      )
      .optional(),
    providerConfiguration: z.record(projectPipelineKeySchema, projectPipelineJsonSchema).optional(),
    parameters: z.record(projectPipelineKeySchema, projectPipelineJsonSchema),
    limits: z
      .object({
        maxConcurrentExecutions: z.number().int().min(1).max(100),
        maxTechnicalAttemptsPerNode: z.number().int().min(1).max(20),
        runTimeoutMinutes: z.number().int().min(1).max(43200),
        nativeModelBudget: projectPipelineNativeModelBudgetSchema.optional()
      })
      .strict()
      .optional(),
    triggers: z
      .array(
        z
          .object({
            adapterRef: projectPipelineRefSchema,
            events: z.array(projectPipelineKeySchema).min(1).max(100)
          })
          .strict()
      )
      .max(100)
      .optional()
  })
  .strict()

/** Selectors are portable configuration, not trusted participant identities or credentials. */
export const projectPipelineConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    template: projectPipelineDefinitionSchema,
    binding: projectPipelineBindingSchema
  })
  .strict()
  .superRefine(({ template, binding }, context) => {
    const issue = (message: string, ...path: Array<string | number>) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message, path })
    if (binding.templateRef !== `${template.key}@${template.version}`)
      issue('TEMPLATE_VERSION_MISMATCH', 'binding', 'templateRef')
    const roles = new Map(template.roles.map((role) => [role.key, role]))
    for (const [key, participant] of Object.entries(binding.roleBindings)) {
      if (!roles.get(key)?.allowedKinds.includes(participant.kind))
        issue('ROLE_KIND_MISMATCH', 'binding', 'roleBindings', key)
    }
    if (template.executionAuthority === 'provider') {
      if (binding.executorBindings !== undefined || binding.triggers !== undefined || binding.limits !== undefined) {
        issue('PROVIDER_CONTROLS_EXECUTION', 'binding')
      }
      for (const role of template.roles) {
        if (!Object.prototype.hasOwnProperty.call(binding.roleBindings, role.key))
          issue('ROLE_BINDING_MISSING', 'binding', 'roleBindings', role.key)
      }
      return
    }
    if (binding.providerConfiguration !== undefined)
      issue('PLATFORM_CONTROLS_EXECUTION', 'binding', 'providerConfiguration')
    if (!binding.limits) issue('EXECUTION_LIMITS_REQUIRED', 'binding', 'limits')
    if (binding.limits?.nativeModelBudget && template.hostRequirements?.features['pipeline.native_model_budget'] !== 1)
      issue('MODEL_BUDGET_PROTOCOL_REQUIRED', 'template', 'hostRequirements')
    for (const [slot, executor] of Object.entries(binding.executorBindings ?? {})) {
      if (!roles.get(executor.roleKey)?.allowedKinds.includes(executor.kind) || executor.kind === 'human') {
        issue('EXECUTOR_ROLE_MISMATCH', 'binding', 'executorBindings', slot)
      }
      if (!template.nodes.some((node) => node.kind === 'work' && node.executorSlot === slot)) {
        issue('EXECUTOR_SLOT_UNUSED', 'binding', 'executorBindings', slot)
      }
    }
    const lanes = new Map(template.lanes.map((lane) => [lane.key, lane]))
    for (const [index, node] of template.nodes.entries()) {
      if (node.kind === 'work') {
        const executor = binding.executorBindings?.[node.executorSlot]
        // Native Assistant/file tools need a separate enforcement bridge before opting in.
        if (node.resourceResolverRef && executor?.kind !== 'service') {
          issue('RESOURCE_EXECUTOR_UNSUPPORTED', 'template', 'nodes', index, 'resourceResolverRef')
        }
        if (!executor || executor.roleKey !== lanes.get(node.laneKey)?.roleKey) {
          issue('EXECUTOR_BINDING_MISSING_OR_WRONG_LANE', 'template', 'nodes', index, 'executorSlot')
        }
      }
      if (node.kind === 'human_gate' && binding.roleBindings[node.candidateRoleKey]?.kind !== 'human') {
        issue('HUMAN_BINDING_REQUIRED', 'binding', 'roleBindings', node.candidateRoleKey)
      }
      for (const [key, input] of Object.entries(node.inputBindings ?? {})) {
        if (input.from === 'parameter' && !Object.prototype.hasOwnProperty.call(binding.parameters, input.key)) {
          issue('PARAMETER_NOT_FOUND', 'template', 'nodes', index, 'inputBindings', key)
        }
      }
    }
  })

export type ProjectPipelineBinding = z.output<typeof projectPipelineBindingSchema>
export type ProjectPipelineConfiguration = z.output<typeof projectPipelineConfigurationSchema>
