import { z } from 'zod/v3'
import { artifactDocumentId } from './protocol'
import { sha256Hex } from './sha256'

/** A lock is public metadata; only the trusted host resolves it to packaged, immutable bytes. */
const dependencyLockObject = z
  .object({
    id: artifactDocumentId,
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/),
    format: z.literal('classic-script'),
    global: z
      .string()
      .regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/)
      .refine(
        (value) =>
          ![
            'window',
            'self',
            'globalThis',
            'document',
            'parent',
            'top',
            'location',
            'xpertLiveArtifact',
            '__proto__',
            'constructor',
            'prototype'
          ].includes(value)
      ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict()

export interface ArtifactDocumentDependencyLock {
  id: string
  version: string
  format: 'classic-script'
  global: string
  sha256: string
}
export interface ArtifactDocumentDependencyAsset extends ArtifactDocumentDependencyLock {
  source: string
}

// Explicit outputs keep required fields in declarations emitted by non-strict host tsconfigs.
export const artifactDocumentDependencyLock = dependencyLockObject.transform(
  (value): ArtifactDocumentDependencyLock => ({
    id: value.id,
    version: value.version,
    format: 'classic-script',
    global: value.global,
    sha256: value.sha256
  })
)

export const artifactDocumentDependencyLocks = z
  .array(artifactDocumentDependencyLock)
  .max(8)
  .superRefine((values, ctx) => {
    if (
      new Set(values.map((value) => value.id)).size !== values.length ||
      new Set(values.map((value) => value.global)).size !== values.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate dependency ID or global' })
  })
export const artifactDocumentDependencyAssets = z
  .array(
    dependencyLockObject
      .extend({ source: z.string().min(1).max(4_000_000) })
      .strict()
      .transform(
        (value): ArtifactDocumentDependencyAsset => ({
          id: value.id,
          version: value.version,
          format: 'classic-script',
          global: value.global,
          sha256: value.sha256,
          source: value.source
        })
      )
  )
  .max(8)

/** Browser/server identical verification. Integrity is not authorization: the caller owns library admission. */
export function verifyArtifactDocumentDependencies(
  input: unknown,
  expected?: ArtifactDocumentDependencyLock[]
): ArtifactDocumentDependencyAsset[] {
  const assets = artifactDocumentDependencyAssets.parse(input)
  const locks = artifactDocumentDependencyLocks.parse(assets.map(({ source, ...lock }) => lock))
  let total = 0
  for (const asset of assets) {
    const bytes = new TextEncoder().encode(asset.source)
    total += bytes.length
    if (bytes.length > 4_000_000 || total > 8_000_000) throw new Error('DOCUMENT_DEPENDENCY_TOO_LARGE')
    if (sha256Hex(bytes) !== asset.sha256) throw new Error('DOCUMENT_DEPENDENCY_INTEGRITY_FAILED')
  }
  if (expected && JSON.stringify(artifactDocumentDependencyLocks.parse(expected)) !== JSON.stringify(locks))
    throw new Error('DOCUMENT_DEPENDENCY_LOCK_MISMATCH')
  return assets.map((asset) => ({
    id: asset.id,
    version: asset.version,
    global: asset.global,
    sha256: asset.sha256,
    source: asset.source,
    format: 'classic-script'
  }))
}

/** Assign script.textContent to preserve exact bytes without eval or HTML parser termination hazards. */
export function renderArtifactDocumentDependencies(assets: ArtifactDocumentDependencyAsset[]): string {
  const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  return verifyArtifactDocumentDependencies(assets)
    .map(
      (asset) =>
        `<script>(()=>{const s=document.createElement('script');s.textContent=${literal(asset.source)};document.head.appendChild(s);s.remove();if(typeof window[${literal(asset.global)}]==='undefined')throw new Error('DOCUMENT_DEPENDENCY_GLOBAL_MISSING');})();</script>`
    )
    .join('')
}
