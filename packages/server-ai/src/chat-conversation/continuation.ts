export interface ConversationContinuation {
    sourceMessageId: string
    confirmation: { name: string; content: string }
}
