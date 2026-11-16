import { z } from 'zod/v3'
import { notificationThreadIdSchema, type OpenConversationAction } from './user-notification.schema'

export const AGENT_OUTPUT_ACCEPT = 'application/json; profile="xpert-agent-output-v1"'

const outputField = z
  .object({
    label: z.object({ en_US: z.string().min(1).max(160), zh_Hans: z.string().min(1).max(160) }).strict(),
    value: z.string().max(4000)
  })
  .strict()
export type AgentOutputField = { label: { en_US: string; zh_Hans: string }; value: string }
export interface AgentOutputItem {
  id: string
  title: string
  action: OpenConversationAction | null
  fields?: AgentOutputField[]
}

const key = z.string().min(1).max(160)
const uuid = z.string().uuid()
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
export const outputQuietHoursSchema = z
  .object({
    zone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value })
          return true
        } catch {
          return false
        }
      }),
    start: hhmm,
    end: hhmm
  })
  .strict()
  .refine((value) => value.start !== value.end)
export type OutputQuietHours = { zone: string; start: string; end: string }
export const outputPreferenceSchema = z
  .object({
    kind: key,
    channel: z.enum(['in_app', 'lark']),
    enabled: z.boolean(),
    integrationId: uuid.nullable(),
    quiet: outputQuietHoursSchema.nullable()
  })
  .strict()
  .refine((v) => (v.channel === 'lark' ? !v.enabled || !!v.integrationId : v.integrationId === null))
export type OutputPreference = {
  kind: string
  channel: 'in_app' | 'lark'
  enabled: boolean
  integrationId: string | null
  quiet: OutputQuietHours | null
}
export const agentOutputReferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: key,
    key,
    revision: key,
    publishedAt: z.string().datetime(),
    recipientId: uuid
  })
  .strict()
export type AgentOutputReference = Required<z.output<typeof agentOutputReferenceSchema>>

export const agentOutputPresentationSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('visible'),
      title: z.string().trim().min(1).max(240),
      fields: z.array(outputField).max(20).optional(),
      conversation: z.object({ conversationId: uuid, threadId: notificationThreadIdSchema.optional() }).strict().optional().catch(undefined)
    })
    .strict(),
  z.object({ status: z.enum(['superseded', 'forbidden', 'unavailable']) }).strict()
])
export type AgentOutputPresentation =
  | {
      status: 'visible'
      title: string
      fields?: AgentOutputField[]
      conversation?: { conversationId: string; threadId?: string }
    }
  | { status: 'superseded' | 'forbidden' | 'unavailable' }
