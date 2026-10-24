// Only the trusted host supplies this policy. Authored HTML cannot expand it.
import { z } from 'zod/v3'

const origin = z
  .string()
  .max(250)
  .refine((value) => {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        url.origin === value &&
        !url.username &&
        !url.password &&
        /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(url.hostname)
      )
    } catch {
      return false
    }
  }, 'Use an exact HTTPS origin without a path, credentials or wildcard')
const origins = z.array(origin).max(16)

export const artifactDocumentNetworkPolicy = z
  .object({
    scripts: origins.optional(),
    styles: origins.optional(),
    fonts: origins.optional(),
    images: origins.optional()
  })
  .strict()
export type ArtifactDocumentNetworkPolicy = z.output<typeof artifactDocumentNetworkPolicy>

export function artifactDocumentCsp(input?: ArtifactDocumentNetworkPolicy): string {
  const policy = artifactDocumentNetworkPolicy.parse(input ?? {})
  const sources = (values?: string[]) => (values?.length ? ` ${[...new Set(values)].join(' ')}` : '')
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline'${sources(policy.scripts)}`,
    `style-src 'unsafe-inline'${sources(policy.styles)}`,
    `img-src data: blob:${sources(policy.images)}`,
    `font-src data:${sources(policy.fonts)}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

/** For preview browser routing; CSP remains the enforcement in the displayed frame. */
export function isArtifactDocumentResourceAllowed(
  policy: ArtifactDocumentNetworkPolicy,
  resourceType: string,
  value: string
): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  const allowed =
    resourceType === 'script'
      ? policy.scripts
      : resourceType === 'stylesheet'
        ? policy.styles
        : resourceType === 'font'
          ? policy.fonts
          : resourceType === 'image'
            ? policy.images
            : undefined
  return allowed?.includes(url.origin) ?? false
}
