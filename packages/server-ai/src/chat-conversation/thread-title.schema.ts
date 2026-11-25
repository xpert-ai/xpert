import { z } from 'zod'

/** Runtime/system metadata is never editable through the thread title endpoint. */
export const threadTitlePatchSchema = z
    .object({
        metadata: z.object({ title: z.string().trim().min(1).max(200) }).strict()
    })
    .strict()
export type ThreadTitlePatch = z.output<typeof threadTitlePatchSchema>
