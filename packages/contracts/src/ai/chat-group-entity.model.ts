import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { ChatGroupDeliveryStatus, ChatGroupInteraction, ChatGroupParticipant } from './chat-group.model'

/**
 * Persistence contracts for group collaboration. These contain internal state and must not be
 * returned as public DTOs; use the explicit projections in chat-group.model.ts for group APIs.
 * All records belong to a tenant and organization. groupId references ChatConversation(purpose='group').
 */

/** Membership identity, Assistant runtime binding and per-member reading/context positions. */
export interface IGroupParticipant extends IBasePerTenantAndOrganizationEntityModel {
  groupId: string
  kind: ChatGroupParticipant['kind']
  /** User Account ID for a human; Xpert ID for an Assistant. */
  subjectId: string
  /** Display label; never use this as an identity or authorization key. */
  name: string
  /** Management role; the primary Assistant is identified by the group's xpertId instead. */
  role: ChatGroupParticipant['role']
  /** Removed members retain their record for message attribution. */
  active: boolean
  /** Assistant-only execution conversation, with purpose='group_assistant_runtime'. */
  runtimeConversationId?: string
  /** Assistant-only execution thread, separate from the public group thread. */
  runtimeThreadId?: string
  /** Assistant's technical principal; execution creators must still use the real human initiator. */
  principalUserId?: string
  /** Highest public message sequence incorporated into this Assistant's completed context. */
  contextSequence: number
  /** Human member's last read public message sequence. */
  readSequence: number
  /** Per-member list preferences, not group-wide settings. */
  pinned: boolean
  archived: boolean
}

/** Delivery/consumption receipt for one public message and recipient; not a second execution queue. */
export interface IGroupMessageRecipient extends IBasePerTenantAndOrganizationEntityModel {
  groupId: string
  /** Public group ChatMessage ID. */
  messageId: string
  /** Recipient membership ID, not its User/Xpert subject ID. */
  participantId: string
  status: ChatGroupDeliveryStatus
  /** Whether this delivery should invoke the recipient Assistant via the existing message queue. */
  wake: boolean
  /** Public group reply that fulfills this request. */
  replyMessageId?: string | null
  /** Recorded Assistant execution and its runtime input message. */
  executionId?: string | null
  inputMessageId?: string | null
  /** Internal admission/recovery checkpoint; separate from the public delivery status. */
  phase?: 'reserved' | 'started' | 'finalized' | null
  /** Internal failure reason; not public error copy. */
  error?: string | null
  /** Dispatch attempts tracked by the receipt retry policy. */
  attempts: number
  /** Public context sequence included in this delivery, used to advance the member's context position. */
  contextSequence: number
  nextAttemptAt: Date
  /** Persisted run admission time, used for recovery and attribution. */
  startedAt?: Date | null
  /** Dispatch lease prevents workers from claiming the same receipt concurrently. */
  leaseToken?: string | null
  leaseUntil?: Date | null
  /** Server-authorized continuation command retained while a paused run is resumed. */
  control?: {
    /** Real User Account ID authorizing the control operation. */
    actorId: string
    pauseId?: string
    decision: { type: 'confirm' | 'reject'; payload?: unknown }
  } | null
}

/** Persisted human interaction and claim state for an Assistant runtime interruption. */
export interface IGroupInteraction extends IBasePerTenantAndOrganizationEntityModel {
  groupId: string
  /** Server-generated deduplication key; distinct from this entity's primary ID. */
  interactionId: string
  /** Assistant membership owning the interrupted runtime. */
  participantId: string
  /** Real User Account designated to handle the interaction. */
  assignedUserId: string
  /** User Account that successfully claimed the interaction. */
  claimedBy?: string | null
  status: ChatGroupInteraction['status']
  /** Delivery receipt that triggered the interrupted execution. */
  recipientId: string
  runId: string
  /** Client claim UUID; binds a response/retry to the successful claim. */
  claimId?: string | null
  /** Stored tool/approval requests; validate with the interaction protocol before consuming. */
  payload: unknown
}
