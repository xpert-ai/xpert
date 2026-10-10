import type { RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'
import type { RuntimeResourcesSelection } from '../agent-plugin'
import type { TAvatar } from '../types'

/**
 * Public group protocol for ChatConversation(purpose='group'). Each Assistant has a separate runtime.
 * Participant IDs identify membership within this group; subject IDs identify User or Xpert records.
 * These DTOs do not grant access: validate inputs and resolve identity/permissions on the server.
 * Extend machine-readable discriminants and their validators/consumers together; never infer kind from names.
 */

/**
 * Server-resolved communication intent, independent of whether the sender is human or an Assistant.
 * `request` addresses members and may wake an Assistant; `reply` answers an existing request and
 * routes back to its sender; `message` publishes information without waking addressed Assistants.
 */
export type ChatGroupIntent = 'request' | 'reply' | 'message'
/** Per-recipient delivery progress, not a read receipt or the overall Assistant run status. */
export type ChatGroupDeliveryStatus =
  /** Accepted for delivery; dispatch may still be pending. */
  | 'pending'
  /** Starting an Assistant run for this message. */
  | 'starting'
  /** Submitted to an active run through the existing steer/follow-up mechanism. */
  | 'steering'
  /** Consumed by the runtime; does not by itself mean a reply has been published. */
  | 'consumed'
  /** Delivery cannot proceed under the current authorization or runtime state. */
  | 'blocked'
  /** Delivery was canceled. */
  | 'canceled'
  /** Dispatch failed after its retry policy was exhausted. */
  | 'failed'

/** Public member profile; runtime conversation IDs and private account data are excluded. */
export interface ChatGroupParticipant {
  /** GroupParticipant ID used by mentions, senders, recipients and runtime projections. */
  id: string
  /** Selects the entity namespace of subjectId; also drives member-specific UI and routing. */
  kind: 'user' | 'assistant'
  /** User Account ID for `user`, Xpert ID for `assistant`; not a membership ID. */
  subjectId: string
  /** Display label only; use IDs for identity and authorization. */
  name: string
  /** Public User/Xpert avatar; absence permits a display fallback. */
  avatar?: TAvatar | null
  /** Group management role; `owner` does not identify the primary Assistant. */
  role: 'owner' | 'member'
  /** Inactive members may remain in snapshots to identify historical message authors. */
  active: boolean
}
/** Invite candidate before membership exists; submit kind + subjectId to add the member. */
export type ChatGroupCandidate = Pick<ChatGroupParticipant, 'kind' | 'subjectId' | 'name' | 'avatar'>
/**
 * Per-message selections from the shared Composer, scoped to one addressed Assistant.
 * This does not choose the recipient: the server requires a single matching Assistant recipient
 * and validates project/file/capability access within that scope.
 */
export interface ChatGroupComposerInput {
  /** Membership ID of the Assistant whose Composer resources were selected. */
  participantId: string
  /** Optional project context for this Assistant, subject to server-side access checks. */
  projectId?: string
  /** Workspace file references, not file contents or arbitrary download URLs. */
  files?: {
    /** Workspace-relative path; currently must match workspacePath. */
    filePath: string
    /** Authorized path in the target workspace; absolute paths and traversal are rejected. */
    workspacePath: string
    originalName?: string
    mimeType?: string
    /** File size in bytes, when available. */
    size?: number
    purpose: 'workspace'
  }[]
  /** Shared runtime-resource selection contract, including its own catalog revision. */
  runtimeResources?: RuntimeResourcesSelection
  /** Shared capability selection contract; selection does not confer permission to use a capability. */
  runtimeCapabilities?: RuntimeCapabilitiesSelection
}

/** Server-authored routing and causality metadata; public senders cannot supply or override identity. */
export interface ChatGroupCommunication {
  /** Validated Composer selections for this message, when supplied by a human sender. */
  composer?: ChatGroupComposerInput
  intent: ChatGroupIntent
  /** Authenticated human or verified runtime author's membership ID. */
  senderId: string
  /** Resolved membership IDs, including the original sender when intent is `reply`. */
  recipientIds: string[]
  /** Public group request being answered; a protocol relationship, not a required UI quote. */
  replyToMessageId?: string
  /** Public group message that caused this runtime output; independent of explicit reply intent. */
  causedByMessageId?: string
  /** First public message ID in the causal chain, inherited across Assistant handoffs/replies. */
  rootMessageId: string
  /** Real initiating User Account ID, inherited for execution attribution; never an Assistant principal. */
  rootUserId: string
  /** Causal depth: roots start at zero; inherited messages increment it for server loop limits. */
  hop: number
}

/** Public message in the shared group transcript, separate from private runtime ChatMessages. */
export interface ChatGroupMessage {
  /** Persisted ChatMessage ID in the group conversation. */
  id: string
  /** Correlation/idempotency key of the original submission; not the persisted message ID. */
  clientMessageId: string
  /** Server-assigned order within this conversation; unchanged when this message is updated. */
  sequence: number
  text: string
  /** ISO 8601 creation timestamp; sequence, not this timestamp, defines transcript order. */
  createdAt: string
  communication: ChatGroupCommunication
  /** Members with linked execution records; opening one still requires separate runtime-view authorization. */
  runtimeParticipantIds?: string[]
  /** Delivery state per addressed member; an empty list does not imply unread or failed delivery. */
  deliveries: { participantId: string; status: ChatGroupDeliveryStatus }[]
}
/**
 * Binds a member to an exact `@name` span in the submitted text. Offsets use JavaScript UTF-16
 * string indices: [start, end). Spans must not overlap; membership and displayed name are validated.
 */
export interface ChatGroupMention {
  /** Membership ID, not the User/Xpert subject ID. */
  participantId: string
  /** Inclusive offset of `@`. */
  start: number
  /** Exclusive offset after the member name. */
  end: number
}

/**
 * Public human-message input. The server derives author, intent and recipients from trusted context
 * and validated mentions. No mentions routes to the primary Assistant (conversation.xpertId);
 * explicit mentions route only to those members. Busy Assistants receive input through steer.
 */
export type ChatGroupSendInput = {
  composer?: ChatGroupComposerInput
  /** Client-generated UUID; reuse for retries of the same submission, scoped to group and sender. */
  clientMessageId: string
  /** Message text against which mention offsets are validated. */
  text: string
  mentions?: ChatGroupMention[]
  /** Reply candidate; it does not override @ routing or the primary-Assistant fallback. */
  replyToMessageId?: string
}

/** Identity to invite; the server resolves display data, access and the new membership ID. */
export type ChatGroupMemberInput = { kind: 'user' | 'assistant'; subjectId: string }
/** Creates the shared conversation with the authenticated human as owner. */
export interface ChatGroupCreateInput {
  title: string
  /** Xpert ID stored as conversation.xpertId and enrolled as the primary Assistant. */
  assistantId: string
}

/** Lightweight list entry; use a snapshot for full membership and message history. */
export interface ChatGroupSummary {
  /** Stable discriminator for the shared Assistant/conversation list. */
  purpose: 'group'
  /** Shared ChatConversation ID, also used as groupId by APIs. */
  id: string
  /** Shared conversation thread ID, not an individual Assistant runtime thread. */
  threadId: string
  title: string
  /** ISO 8601 list activity time, using the latest message time when available. */
  updatedAt: string
  /** Truncated preview only; never use it as the full message or for routing. */
  lastMessage: string
  /** Total active members; may exceed the avatar preview count in members. */
  memberCount: number
  /** Bounded active-member preview for composite avatars, not the complete roster. */
  members: Pick<ChatGroupParticipant, 'id' | 'kind' | 'name' | 'avatar'>[]
  /** Current viewer's unread state, based on their read sequence. */
  unread: boolean
  /** Current viewer's list preference, not a group-wide setting. */
  pinned: boolean
  /** Current viewer's list preference; does not archive the group for other members. */
  archived: boolean
}

/** Authorized public state plus one page of persisted messages; excludes private runtime configuration. */
export interface ChatGroupSnapshot {
  /** Shared ChatConversation ID, also used as groupId by APIs. */
  id: string
  /** Shared conversation thread ID; Assistant execution threads are separate. */
  threadId: string
  title: string
  /** Current viewer's membership ID; compare with communication.senderId for own-message presentation. */
  viewerParticipantId: string
  /** Primary Assistant's Xpert ID; match an assistant member's subjectId, not its id or role. */
  xpertId: string
  /** Includes inactive members so older messages can retain their authors' identities. */
  members: ChatGroupParticipant[]
  /** One history page in ascending sequence order, not necessarily the full transcript. */
  messages: ChatGroupMessage[]
  /** Older messages exist before this page; paginate using its earliest message sequence. */
  hasMore: boolean
  /** Server state version covering message, membership and delivery changes; not a message count or SSE cursor. */
  revision: number
  /** Public runtime state for member threads with a recorded run, including completed/idle runs. */
  runs: ChatGroupRun[]
  /** Pending/claimed human interactions; full request payloads are returned only to an authorized claimant. */
  interactions?: ChatGroupInteraction[]
}

/** Public summary of a runtime pause requiring a designated human's approval or client tool execution. */
export interface ChatGroupInteraction {
  id: string
  /** Run that produced this interaction. */
  runId: string
  /** Assistant membership ID owning the run. */
  participantId: string
  /** User Account ID allowed to claim/respond; not a group membership ID. */
  assignedUserId: string
  /** Claim/response lifecycle; claiming does not itself complete or resume the interaction. */
  status: 'pending' | 'claimed' | 'completed' | 'canceled'
}

/** Returned after the assigned human claims an interaction; observing the group stream does not claim it. */
export interface ChatGroupInteractionClaim {
  /** Interaction ID, matching ChatGroupInteraction.id. */
  id: string
  /** Client claim identifier bound by the server; reuse it when responding or retrying the same claim. */
  claimId: string
  /** Discriminate by kind, then validate request with the existing client-tool or approval protocol. */
  requests: ({ kind: 'client_tool'; request: unknown } | { kind: 'approval'; request: unknown })[]
}

/** Public projection of one Assistant runtime's current thread/run control state. */
export interface ChatGroupRun {
  /** Assistant membership ID. */
  participantId: string
  /** Execution/run identifier; not the shared group thread ID. */
  runId: string
  /** Thread state, distinct from individual message delivery statuses. */
  status: 'busy' | 'pausing' | 'paused' | 'interrupted' | 'idle' | 'error'
}

/**
 * Public group SSE payload. Transport event IDs are opaque replay cursors, separate from revision/sequence.
 * Extend this union together with stream validation and reducers; private runtime events do not belong here.
 */
export type ChatGroupEvent =
  /** Refresh public state and reconcile its history page by message ID. */
  | { type: 'snapshot'; snapshot: ChatGroupSnapshot }
  /** Append a text delta to a runtime output; messageId is the runtime output ID, not yet the group message ID. */
  | { type: 'text'; participantId: string; runId: string; messageId: string; text: string }
  /** Replay continuity was lost; recover from a fresh snapshot rather than trusting accumulated deltas. */
  | { type: 'resync' }

/**
 * Workspace-authorized view of the execution linked to a public group message.
 * Opens in the existing external-Assistant Workbench view; group membership alone grants no runtime access.
 * Contains selected display messages, never checkpoints or runtime configuration.
 */
export interface ChatGroupRuntimeView {
  /** Assistant's ChatConversation(purpose='group_assistant_runtime'), not the shared group conversation. */
  conversationId: string
  /** Assistant runtime thread ID. */
  threadId: string
  /** Xpert ID owning the execution. */
  xpertId: string
  /** Corresponding Assistant membership ID in the shared group. */
  participantId: string
  title: string
  avatar?: TAvatar | null
  /** Recorded execution selected by the public group message and participant. */
  executionId: string
  /** Optional runtime input/output message to focus when opening the view. */
  messageId?: string
  /** Execution status, distinct from the group's delivery and thread statuses. */
  status: string
  /** Display projection for this execution; human runtime context is replaced with the public question. */
  messages: {
    /** Runtime ChatMessage ID, not the public group message ID. */
    id: string
    role: string
    /** Existing message-content payload; narrow with its renderer/protocol before use. */
    content: unknown
    /** Optional reasoning payload; likewise requires the existing message protocol's narrowing. */
    reasoning?: unknown
    status?: string
    executionId?: string
    /** ISO 8601 timestamp. */
    createdAt: string
  }[]
}
