import { z } from 'zod/v3'

const scalar = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
const parameters = z
  .record(z.string().min(1).max(100), z.union([scalar, z.array(scalar).max(100)]))
  .refine((value) => Object.keys(value).length <= 50 && JSON.stringify(value).length <= 12000)

/** A declared View and its bounded, credential-free selection context; it grants no access. */
export const workbenchViewLocationSchema = z
  .object({
    viewKey: z.string().trim().min(1).max(256),
    selectionId: z.string().trim().min(1).max(256).optional(),
    parameters: parameters.optional()
  })
  .strict()

/** A declared View location without identity or authorization policy. */
export interface WorkbenchViewLocation {
  viewKey: string
  selectionId?: string
  parameters?: z.output<typeof parameters>
}

export const assistantWorkbenchViewInputSchema = workbenchViewLocationSchema.extend({
  projectId: z.string().uuid().nullable()
})
export type AssistantWorkbenchViewInput = WorkbenchViewLocation & { projectId: string | null }

/** A concrete Assistant View destination. Identity and scope are subject to current host authorization. */
export const assistantWorkbenchTargetSchema = assistantWorkbenchViewInputSchema.extend({
  /** A declared Assistant Workbench View; arbitrary URLs and commands are outside this target. */
  target: z.literal('workbench.view'),
  assistantId: z.string().uuid(),
  organizationId: z.string().uuid().nullable()
})
export type AssistantWorkbenchTarget = AssistantWorkbenchViewInput & {
  /** A declared Assistant Workbench View; the destination grants no resource access. */
  target: 'workbench.view'
  assistantId: string
  organizationId: string | null
}

/** A domain-owned pipeline location; Assistant selection remains with the Project domain. */
export const projectPipelineWorkbenchTargetSchema = z
  .object({
    /** A Project pipeline location requiring domain resolution before opening a Workbench. */
    target: z.literal('project.pipelines'),
    organizationId: z.string().uuid().nullable(),
    projectId: z.string().uuid(),
    pipelineInstanceId: z.string().uuid(),
    pipelineRoundId: z.string().uuid(),
    pipelineNodeId: z.string().uuid()
  })
  .strict()
export type ProjectPipelineWorkbenchTarget = Required<z.output<typeof projectPipelineWorkbenchTargetSchema>>

/** Cross-surface navigation intent, independent of notification delivery and business decisions. */
export const workbenchEntryTargetSchema = z.discriminatedUnion('target', [
  projectPipelineWorkbenchTargetSchema,
  assistantWorkbenchTargetSchema
])
export type WorkbenchEntryTarget = ProjectPipelineWorkbenchTarget | AssistantWorkbenchTarget

/** Current host-authorized Assistant scope and View location; this descriptor contains no credential. */
export interface WorkbenchEntry {
  projectId: string | null
  organizationId: string | null
  assistant: { id: string; name: string }
  view: WorkbenchViewLocation
}

export const workbenchEntrySchema = z
  .object({
    projectId: z.string().uuid().nullable(),
    organizationId: z.string().uuid().nullable(),
    assistant: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    view: workbenchViewLocationSchema
  })
  .strict()

export function parseWorkbenchEntry(value: unknown): WorkbenchEntry {
  return workbenchEntrySchema.parse(value) as WorkbenchEntry
}

export function parseWorkbenchEntryTarget(value: unknown): WorkbenchEntryTarget {
  return workbenchEntryTargetSchema.parse(value) as WorkbenchEntryTarget
}
