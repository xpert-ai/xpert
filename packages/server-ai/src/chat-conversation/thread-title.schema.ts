import { z } from 'zod'

/** Runtime/system metadata is never editable through the thread metadata endpoint. */
export const threadTitlePatchSchema = z
    .object({
        metadata: z.object({ title: z.string().trim().min(1).max(200) }).strict()
    })
    .strict()
export type ThreadTitlePatch = z.output<typeof threadTitlePatchSchema>

/** Only the side-chat archive flag and label are user-editable, in separate operations. */
export const threadMetadataPatchSchema = z.union([
    threadTitlePatchSchema,
    z.object({ metadata: z.object({ archived: z.boolean() }).strict() }).strict()
])
export type ThreadMetadataPatch = {
    metadata: Required<z.output<typeof threadMetadataPatchSchema>['metadata']>
}
