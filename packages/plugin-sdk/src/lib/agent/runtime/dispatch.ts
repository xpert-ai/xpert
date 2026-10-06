import { z } from 'zod/v3'
import { projectTaskExecutionContextSchema } from '@xpert-ai/contracts'

/** Captured by an authorized host command. Describing a recipient never authorizes delivery. */
const replyConversation = {
  conversationId: z.string().uuid(),
  threadId: z.string().trim().min(1).max(256)
}
export const agentRuntimeReplyTargetSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...replyConversation,
      type: z.literal('xpert').optional(),
      xpertId: z.string().uuid(),
      agentKey: z.string().trim().min(1).max(256)
    })
    .strict(),
  z
    .object({
      ...replyConversation,
      type: z.literal('project_agent'),
      projectId: z.string().uuid(),
      agentKey: z.literal('general_agent')
    })
    .strict()
])
export type AgentRuntimeReplyTarget = z.output<typeof agentRuntimeReplyTargetSchema>

/** Persist with the immutable invocation request before launch. No credentials or arbitrary routing headers. */
export const agentInvocationDispatchContextSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    sourceMessageId: z.string().trim().min(1).max(256),
    replyTo: agentRuntimeReplyTargetSchema,
    projectTask: projectTaskExecutionContextSchema.optional()
  })
  .strict()
export type AgentInvocationDispatchContext = z.output<typeof agentInvocationDispatchContextSchema>
