import { z } from 'zod/v3'

export const openAgentEvolutionSchema = z.object({
    tab: z
        .enum(['overview', 'learning', 'evaluation', 'release'])
        .optional()
        .describe('Evolution Center tab to open. Defaults to overview.')
})

export const getAgentEvolutionStatusSchema = z.object({
    targetId: z.string().min(1).optional().describe('Optional evolution target id to filter in the status summary.')
})
