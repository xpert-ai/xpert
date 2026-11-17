import type { AgentOutputField } from './agent-output.model'
import { agentOutputReferenceSchema } from './agent-output-reference.schema'
import { z } from 'zod/v3'

const uuid = z.string().uuid()
const choice = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
const label = z.object({ en_US: z.string().min(1).max(100), zh_Hans: z.string().min(1).max(100) }).strict()
const requestVersion = z.number().int().positive()
const choices = z
  .array(z.object({ key: choice, label, replyCommand: z.string().trim().min(1).max(100).optional() }).strict())
  .min(2)
  .max(5)
  .refine((options) => {
    const commands = options.flatMap((c) => (c.replyCommand ? [c.replyCommand] : []))
    return new Set(options.map((c) => c.key)).size === options.length && new Set(commands).size === commands.length
  })

/** Validates the choices a source offers. Choice keys and direct-reply commands must each be unambiguous. */
export const humanDecisionSchema = z
  .object({ type: z.literal('human_decision'), schemaVersion: z.literal(1), requestVersion, choices })
  .strict()
/**
 * A request for an authorized person to choose a business outcome. The source defines the choices
 * and their effects. Buttons submit a stable choice key. A quoted reply must match a declared
 * replyCommand. The enclosing output reference identifies the request and business revision.
 */
export type HumanDecision = z.output<typeof humanDecisionSchema>

/** Validates the submission shared by workbench actions and verified private-channel replies. */
export const humanDecisionInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: agentOutputReferenceSchema.shape.key,
    sourceRevision: agentOutputReferenceSchema.shape.revision,
    requestVersion,
    choice,
    commandId: uuid
  })
  .strict()
/**
 * One choice for the request and business revision the person saw. requestVersion identifies
 * the state of the decision request. sourceRevision identifies the underlying business terms.
 * Retries reuse commandId. The source arbitrates competing submissions under the authenticated actor.
 */
export type HumanDecisionInput = z.output<typeof humanDecisionInputSchema>
/** Outcomes the workbench and channels can report after a submission is evaluated. */
export const humanDecisionStatusSchema = z.enum([
  'recorded',
  'already_recorded',
  'conflicting_choice',
  'stale',
  'closed',
  'forbidden'
])
/**
 * Outcome of submitting a choice for a decision request.
 *
 * - `recorded` — The source committed the choice.
 * - `already_recorded` — The source previously committed the same choice for this request.
 * - `conflicting_choice` — The choice conflicts with a recorded decision, or the command ID was reused with different input.
 * - `stale` — The submitted version is out of date. Review the current request before choosing again.
 * - `closed` — The request no longer accepts choices.
 * - `forbidden` — The submission could not be authorized.
 */
export type HumanDecisionStatus = z.infer<typeof humanDecisionStatusSchema>

/** Submission outcomes that can replace the actionable controls on the original private card. */
export const privateDecisionFeedbackStatusSchema = humanDecisionStatusSchema.extract([
  'recorded',
  'already_recorded',
  'stale',
  'closed'
])
/** A visible outcome for the original recipient. Conflicts and unauthorized attempts leave the card untouched. */
export type PrivateDecisionFeedbackStatus = z.infer<typeof privateDecisionFeedbackStatusSchema>

/**
 * Result returned to the caller after submitting a choice. When present, decisionId identifies the source's durable
 * business decision. Concurrent submissions from different channels can return the same ID.
 */
export type HumanDecisionResult = { status: HumanDecisionStatus; decisionId?: string }

/** Accepts a button callback or a reply quoting a specific message, together with its sender and chat. */
export const privateDecisionReplySchema = z
  .object({
    parentId: z.string().min(1).max(256),
    chatId: z.string().min(1).max(256),
    openId: z.string().min(1).max(256),
    unionId: z.string().min(1).max(256).optional(),
    input: z.discriminatedUnion('type', [
      z.object({ type: z.literal('button'), interactionId: uuid, choice }).strict(),
      z.object({ type: z.literal('quoted_text'), text: z.string().min(1).max(100) }).strict()
    ])
  })
  .strict()

/**
 * Channel evidence for a button click or a direct reply quoting the original card.
 * The host matches `parentId` and `chatId` to the delivery and checks the sender's current identity
 * binding before translating the button key or declared reply command into a decision input.
 */
export type PrivateDecisionReply = z.output<typeof privateDecisionReplySchema>

/**
 * A single recipient's decision as delivered to a private chat. The channel renders the
 * authorized fields and choices, using the host's delivery attempt ID to correlate button replies.
 */
export interface PrivateDecisionCard {
  title: string
  fields: AgentOutputField[]
  decision: HumanDecision
}
