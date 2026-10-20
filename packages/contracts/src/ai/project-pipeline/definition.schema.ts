// Invariants: definitions describe versioned topology and explicit execution authority.
// Business meaning stays behind provider references; labels and icons never drive execution.
import { z } from 'zod/v3'
import {
  projectPipelineEdgeSchema,
  projectPipelineKeySchema,
  projectPipelineLaneSchema,
  projectPipelineRefSchema,
  projectPipelineRoleSchema,
  projectPipelineStageSchema
} from './primitives.schema'
import { projectPipelineNodeSchema } from './node.schema'
import { validateProjectPipelineDefinition } from './definition.validation'
import { projectPipelineHostRequirementsSchema } from './compatibility.schema'

const common = {
  hostRequirements: projectPipelineHostRequirementsSchema.optional(),
  key: projectPipelineKeySchema,
  version: z
    .string()
    .max(80)
    .regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  title: z.string().min(1).max(240),
  subjectResolverRef: projectPipelineRefSchema,
  roles: z.array(projectPipelineRoleSchema).min(1).max(100),
  lanes: z.array(projectPipelineLaneSchema).min(1).max(100),
  stages: z.array(projectPipelineStageSchema).min(1).max(100),
  presentation: z
    .object({
      views: z
        .array(z.enum(['tasks', 'pipeline', 'agent_timeline']))
        .min(1)
        .max(3),
      nodeDetailRef: projectPipelineRefSchema.optional(),
      evidenceTypes: z.array(projectPipelineRefSchema).max(100).optional()
    })
    .strict()
    .optional(),
  metrics: z
    .object({
      dimensionRefs: z.array(projectPipelineRefSchema).max(100),
      metricRefs: z.array(projectPipelineRefSchema).max(100)
    })
    .strict()
    .optional()
}

// A provider owns topology and advancement. A managed definition owns a bounded DAG per round.
export const projectPipelineDefinitionShapeSchema = z.discriminatedUnion('executionAuthority', [
  z
    .object({
      ...common,
      executionAuthority: z.literal('provider'),
      providerRef: projectPipelineRefSchema,
      topology: z.object({ source: z.literal('provider'), presentationAdapterRef: projectPipelineRefSchema }).strict(),
      actionRefs: z.array(projectPipelineRefSchema).max(100).optional()
    })
    .strict(),
  z
    .object({
      ...common,
      executionAuthority: z.literal('platform'),
      topology: z.object({ source: z.literal('definition') }).strict(),
      nodes: z.array(projectPipelineNodeSchema).min(1).max(500),
      edges: z.array(projectPipelineEdgeSchema).max(2000),
      roundPolicy: z
        .object({
          entryNodeKey: projectPipelineKeySchema,
          maxRounds: z.number().int().min(1).max(100),
          onRework: z.literal('await_new_subject_then_next_round'),
          onLimit: z.literal('attention'),
          newVersionWhileActive: z.literal('supersede_round'),
          terminalOutcomes: z.array(projectPipelineKeySchema).min(1).max(32)
        })
        .strict(),
      failurePolicy: z
        .object({
          requiredNodeFailure: z.literal('block_and_attention'),
          unknownExecution: z.literal('inspect_without_replay')
        })
        .strict()
    })
    .strict()
])

export type ProjectPipelineDefinition = z.output<typeof projectPipelineDefinitionShapeSchema>
export const projectPipelineDefinitionSchema = projectPipelineDefinitionShapeSchema.superRefine(
  (definition, context) => {
    for (const issue of validateProjectPipelineDefinition(definition)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.code })
    }
  }
)
