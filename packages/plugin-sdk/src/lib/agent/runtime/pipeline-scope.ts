import { z } from 'zod/v3'
import { projectPipelineWorkContextSchema } from '@xpert-ai/contracts'

/** Host-only provenance. This describes a saved operation; it never grants access by itself. */
export const projectPipelineInvocationScopeSchema = z
  .object({
    tenantId: z.string().uuid(),
    organizationId: z.string().uuid(),
    userId: z.string().uuid(),
    projectId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    callerType: z.literal('project_pipeline'),
    callerAgentKey: z.literal('pipeline_node'),
    parentExecutionId: z.string(),
    pipelineOrigin: projectPipelineWorkContextSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.parentExecutionId !== `pipeline-operation:${value.pipelineOrigin.operationId}`)
      context.addIssue({ code: 'custom', message: 'PIPELINE_PARENT_IDENTITY_MISMATCH' })
  })
export type ProjectPipelineInvocationScope = z.output<typeof projectPipelineInvocationScopeSchema>
