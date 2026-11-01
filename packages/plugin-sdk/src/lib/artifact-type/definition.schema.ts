import { z } from 'zod/v3'

/** Package exports are a runtime boundary; reject malformed declarations before registration. */
export const artifactTypeDefinitionSchema = z
  .object({
    title: z
      .object({
        en_US: z.string().trim().min(1).max(200),
        zh_Hans: z.string().trim().min(1).max(200).optional(),
        zh_Hant: z.string().trim().min(1).max(200).optional()
      })
      .strict()
      .optional(),
    kinds: z.array(z.enum(['html', 'markdown', 'pdf', 'pptx', 'image', 'file', 'site', 'presentation'])).min(1),
    collection: z.object({ allowCopy: z.boolean() }).strict().optional(),
    versioning: z
      .object({ mode: z.literal('draft-only') })
      .strict()
      .optional(),
    content: z
      .object({ mimeTypes: z.array(z.string().min(1)).min(1), maxBytes: z.number().int().positive() })
      .strict()
      .optional(),
    sharing: z
      .object({
        projectAccess: z.literal('link-audience').optional(),
        accessModes: z
          .array(
            z.enum([
              'owner_only',
              'workspace_all',
              'organization_all',
              'custom_principals',
              'public_link',
              'signed_preview'
            ])
          )
          .min(1),
        versionModes: z.array(z.enum(['latest', 'version'])).min(1),
        maxTtlSeconds: z.number().int().positive().optional(),
        allowDownload: z.boolean(),
        mutableLinks: z.boolean(),
        descriptor: z.boolean(),
        shareKey: z.string().min(1).optional()
      })
      .strict()
      .optional(),
    presentation: z.object({ mode: z.enum(['file', 'snapshot', 'authenticated']) }).strict()
  })
  .strict()
  .refine(
    (definition) =>
      definition.sharing?.projectAccess !== 'link-audience' ||
      (definition.presentation.mode === 'authenticated' &&
        definition.sharing.accessModes.every((mode) => ['organization_all', 'workspace_all'].includes(mode))),
    'Project link audiences require authenticated organization or workspace sharing'
  )
