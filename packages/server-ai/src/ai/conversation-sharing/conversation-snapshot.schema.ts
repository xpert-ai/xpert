import { z } from 'zod/v3'
export const snapshotSchema = z
    .object({
        title: z.string().max(300),
        messages: z.array(z.object({ role: z.enum(['human', 'ai']), text: z.string() }).strict()).max(1000)
    })
    .strict()
