import { agentOutputReferenceSchema } from './agent-output-reference.schema'
import { humanDecisionSchema, type HumanDecision } from './human-decision.model'
import { z } from 'zod/v3'
import { notificationThreadIdSchema, type OpenConversationAction } from '../user-notification.schema'

/** HTTP Accept profile for notification clients that can display agent outputs in list and sync responses. */
export const AGENT_OUTPUT_ACCEPT = 'application/json; profile="xpert-agent-output-v1"'

const outputField = z
  .object({
    label: z.object({ en_US: z.string().min(1).max(160), zh_Hans: z.string().min(1).max(160) }).strict(),
    value: z.string().max(4000)
  })
  .strict()
/**
 * A labeled value the source has cleared for this recipient. Notification details and private
 * decision cards share these display fields, for example a supplier's proposed delivery date.
 */
export type AgentOutputField = { label: { en_US: string; zh_Hans: string }; value: string }
/**
 * One readable result in an in-app notification, which may group several results. The id
 * identifies the delivery member. The host adds a conversation action when navigation is authorized.
 */
export interface AgentOutputItem {
  id: string
  title: string
  action: OpenConversationAction | null
  fields?: AgentOutputField[]
}

const key = agentOutputReferenceSchema.shape.key
const uuid = z.string().uuid()
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
/** Validates the local delivery window against its time zone, including windows that span midnight. */
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
/**
 * A recipient's daily quiet period in local time. Outputs arriving during the period can
 * be grouped for delivery when it ends. An end before the start falls on the following day.
 */
export type OutputQuietHours = { zone: string; start: string; end: string }
/** Validates per-channel settings. Enabling private Lark delivery requires a selected integration. */
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
/**
 * A recipient's delivery policy for one output kind and channel in the current organization.
 * The recipient chooses the channel and quiet period. The source still authorizes each result.
 */
export type OutputPreference = {
  kind: string
  channel: 'in_app' | 'lark'
  enabled: boolean
  integrationId: string | null
  quiet: OutputQuietHours | null
}
export { agentOutputReferenceSchema }
/**
 * Identifies a committed result for one recipient, for example a published delivery reminder.
 * The source reuses this reference across handoff retries with the same business revision and
 * publication time. The host assigns a message ID when it accepts the result.
 */
export type AgentOutputReference = Required<z.output<typeof agentOutputReferenceSchema>>

/** Validates the source's current visibility outcome and the content it permits the recipient to see. */
export const agentOutputPresentationSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('visible'),
      title: z.string().trim().min(1).max(240),
      decision: humanDecisionSchema.optional(),
      fields: z.array(outputField).max(20).optional(),
      conversation: z
        .object({ conversationId: uuid, threadId: notificationThreadIdSchema.optional() })
        .strict()
        .optional()
        .catch(undefined)
    })
    .strict(),
  z.object({ status: z.enum(['superseded', 'forbidden', 'unavailable']) }).strict()
])
/**
 * The source resolves the result for its recipient at dispatch and again on read.
 *
 * - `visible` — The source provides content for the recipient and may offer a human decision.
 * - `superseded` — The result is no longer current and is omitted.
 * - `forbidden` — The recipient lacks access to the result and it is omitted.
 * - `unavailable` — The source cannot resolve the result yet. Dispatch may retry, and the current read omits it.
 */
export type AgentOutputPresentation =
  | {
      status: 'visible'
      title: string
      decision?: HumanDecision
      fields?: AgentOutputField[]
      conversation?: { conversationId: string; threadId?: string }
    }
  | { status: 'superseded' | 'forbidden' | 'unavailable' }
