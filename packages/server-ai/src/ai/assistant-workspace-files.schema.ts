import { z } from 'zod/v3'

const filePath = z.string().min(1).max(4096)
// Filesystem containment and symlink checks remain in VolumeSubtreeClient.
export const workspaceFileQuerySchema = z.object({ path: filePath }).strict()
export const workspaceFilesQuerySchema = z
    .object({
        path: z.string().max(4096).default(''),
        deepth: z.coerce.number().int().min(0).max(32).optional()
    })
    .strict()
export const workspaceFileWriteSchema = z.object({ path: filePath, content: z.string() }).strict()
export const workspaceFileUploadSchema = z.object({ path: z.string().max(4096).default('') }).strict()
export type WorkspaceFileQuery = z.output<typeof workspaceFileQuerySchema>
export type WorkspaceFilesQuery = z.output<typeof workspaceFilesQuerySchema>
export type WorkspaceFileWrite = z.output<typeof workspaceFileWriteSchema>
export type WorkspaceFileUpload = z.output<typeof workspaceFileUploadSchema>
