import { z } from 'zod/v3'

/** Wire namespace/version shared by the trusted host and its isolated document bootstrap. */
export const ARTIFACT_DOCUMENT_CHANNEL = 'xpert.artifact-document'
export const ARTIFACT_DOCUMENT_VERSION = 1

/** Portable binding/control identifier; shape validation never grants resource access. */
export const artifactDocumentId = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
export const artifactDocumentValue = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
export const artifactDocumentControls = z
  .record(artifactDocumentId, artifactDocumentValue)
  .refine((value) => Object.keys(value).length <= 24, 'Too many controls')

/** The entire untrusted query envelope. Provider definitions, SQL and identity fields are forbidden. */
export const artifactDocumentQuery = z
  .object({
    type: z.literal('query'),
    requestId: z.string().min(1).max(80),
    bindingId: artifactDocumentId,
    controls: artifactDocumentControls
  })
  .strict()

/** Flat UI filter values keyed by declared control IDs; validated again by the backend Binding. */
// Explicit wire types preserve null and required keys in declarations built by non-strict host tsconfigs.
export type ArtifactDocumentControls = Record<string, string | number | boolean | null>
/** Correlates a document request with one host result; the host owns binding resolution and authorization. */
export interface ArtifactDocumentQuery {
  type: 'query'
  requestId: string
  bindingId: string
  controls: ArtifactDocumentControls
}

/** Only public presentation context may cross into the untrusted frame. Never include credentials here. */
export const artifactDocumentContext = z
  .object({
    bindingIds: z
      .array(artifactDocumentId)
      .max(64)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate binding IDs'),
    defaults: artifactDocumentControls,
    theme: z.enum(['light', 'dark']),
    locale: z.string().min(1).max(80)
  })
  .strict()

/** A snapshot for one mount. Artifact/version/actor identity belongs in the trusted query callback closure. */
export interface ArtifactDocumentContext {
  bindingIds: string[]
  defaults: ArtifactDocumentControls
  theme: 'light' | 'dark'
  locale: string
}

/** Format/UTF-8 size gate, not a sanitizer. Isolation and server authorization enforce security. */
export const artifactDocumentHtml = z
  .string()
  .min(1)
  .max(300000)
  .superRefine((html, ctx) => {
    if (new TextEncoder().encode(html).byteLength > 300000 || !/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html))
      ctx.addIssue({ code: 'custom', message: 'Supply a complete UTF-8 HTML document, at most 300 KB' })
  })
