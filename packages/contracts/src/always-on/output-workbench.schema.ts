import { z } from 'zod/v3'
import type { AssistantWorkbenchTarget } from '../view-extension/workbench-entry.schema'

const label = z
  .object({ en_US: z.string().trim().min(1).max(160), zh_Hans: z.string().trim().min(1).max(160) })
  .strict()
export const outputFieldSchema = z.object({ label, value: z.string().max(4000) }).strict()

/** A source-owned business item and its location in an Assistant workbench. Handling is independent of notification read state. */
export const outputWorkbenchSchema = z
  .object({
    state: z.enum(['pending', 'handled']),
    title: label,
    openLabel: label,
    viewKey: z.string().trim().min(1).max(256),
    selectionId: z.string().trim().min(1).max(256)
  })
  .strict()

type Label = { en_US: string; zh_Hans: string }
/** The source identifies the workbench record, its localized action and current business state. */
export interface OutputWorkbench {
  state: 'pending' | 'handled'
  title: Label
  openLabel: Label
  viewKey: string
  selectionId: string
}
/** The platform supplies the authorized host scope for this result. */
export type OutputWorkbenchTarget = OutputWorkbench & {
  assistantId: string
  organizationId: string
  projectId: string | null
}
export const outputWorkbenchTargetSchema = outputWorkbenchSchema.extend({
  assistantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable()
})

/** Preserve the source's navigation context independently of its business presentation. */
export function outputWorkbenchEntry(target: OutputWorkbenchTarget): AssistantWorkbenchTarget {
  return {
    target: 'workbench.view',
    assistantId: target.assistantId,
    organizationId: target.organizationId,
    projectId: target.projectId,
    viewKey: target.viewKey,
    selectionId: target.selectionId
  }
}
