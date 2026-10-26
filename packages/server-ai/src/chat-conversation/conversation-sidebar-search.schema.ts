import { z } from 'zod'

export const conversationSidebarSearchSchema = z.string().trim().max(200).optional().default('')
export type ConversationSidebarSearch = z.output<typeof conversationSidebarSearchSchema>
