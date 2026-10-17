import { z } from 'zod/v3'

/** Portable Agent input; filesystem containment and authorization remain with the host. */
export const workspaceRelativeFilePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !/[\\\x00-\x1f\x7f]/.test(value) &&
      !/^[A-Za-z]:/.test(value) &&
      value.split('/').every((part) => part.length > 0 && part === part.trim() && part !== '.' && part !== '..'),
    'Use a workspace-relative file path with non-empty segments; no absolute paths, traversal or surrounding whitespace.'
  )

/** Host-owned metadata lets plugins observe file intent without guessing tool names. */
export const workspaceFileMutationMetadata = {
  workspaceFileOperation: { type: 'mutation', pathArgument: 'file_path' }
} as const

const mutationMetadata = z.object({
  workspaceFileOperation: z.object({
    type: z.literal('mutation'),
    pathArgument: z.string().min(1)
  })
})

export function workspaceFileMutationPath(metadata: unknown, args: Record<string, unknown>): string | undefined {
  const descriptor = mutationMetadata.safeParse(metadata)
  if (!descriptor.success) return undefined
  const path = workspaceRelativeFilePathSchema.safeParse(args[descriptor.data.workspaceFileOperation.pathArgument])
  return path.success ? path.data : undefined
}
