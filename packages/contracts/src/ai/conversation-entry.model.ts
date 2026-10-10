/**
 * Authorized metadata for opening a conversation in the shared ChatKit shell.
 * Select the private/group adapter by purpose, not by title, route text or the presence of xpertId.
 * Excludes messages and runtime configuration; group Assistant runtimes are opened through their
 * separately authorized execution view, never as a third top-level chat adapter here.
 */
export interface ChatConversationEntry {
  /** ChatConversation ID; for group entries this is also the API groupId. */
  id: string
  /** Thread belonging to this conversation; not a group member's separate runtime thread. */
  threadId: string
  /** Owning Xpert ID for private chat or primary Assistant's Xpert ID for a group; null when unbound. */
  xpertId: string | null
  /** Display title; clients may provide a localized fallback when absent. */
  title: string | null
  /** Server-resolved adapter discriminator; internal group_assistant_runtime records are excluded. */
  purpose: 'private' | 'group'
}
