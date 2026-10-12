import { z } from 'zod/v3'

/** Host-owned routing context for a native Assistant invocation, not a separate runtime provider. */
export const assistantTaskGroupContextSchema = z
  .object({
    type: z.literal('group_member'),
    groupId: z.string().uuid(),
    participantId: z.string().uuid(),
    sourceParticipantId: z.string().uuid(),
    projectId: z.string().uuid()
  })
  .strict()
export type AssistantTaskGroupContext = z.output<typeof assistantTaskGroupContextSchema>

export function assistantTaskGroupContext(target: {
  provider: string
  configuration: unknown
}): AssistantTaskGroupContext | null {
  if (target.provider !== 'xpert-task') return null
  const parsed = z.object({ executionContext: assistantTaskGroupContextSchema }).safeParse(target.configuration)
  return parsed.success ? parsed.data.executionContext : null
}
