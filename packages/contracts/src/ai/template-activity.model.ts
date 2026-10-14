import { z } from 'zod'

export const templateActivityReadSchema = z
  .object({
    keys: z
      .array(z.string().regex(/^[a-f0-9-]{36}:(pending|running|awaiting_approval|paused|succeeded|failed)$/))
      .max(50)
  })
  .strict()
export type TemplateActivityRead = z.output<typeof templateActivityReadSchema>
export interface TemplateActivity {
  assistantName: string
  items: {
    id: string
    key: string
    routine: string
    status: 'pending' | 'running' | 'awaiting_approval' | 'paused' | 'succeeded' | 'failed'
    scheduledAt: string
    conversationId?: string
    threadId?: string
    unread: boolean
    reason?: string
  }[]
  unread: number
}
