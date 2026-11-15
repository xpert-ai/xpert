// Preflight and submission share these rules; a successful check is not business acceptance or a grant.
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { developmentManifestSchema, deploymentManifestSchema, gitManifestSchema, type Phase } from './schemas'
import { codingError } from './errors'

export interface MaterialIssue {
  path: string
  code: string
  message: string
}

export function materialIssue(path: string, code: string, message: string): MaterialIssue {
  return { path, code, message: t(`coding_project:Material.${code}`, { defaultValue: message }) }
}

export class MaterialValidationError extends BadRequestException {
  readonly diagnostic: { valid: false; saved: false; code: string; issues: MaterialIssue[] }
  constructor(code: string, issues: MaterialIssue[]) {
    const diagnostic = { valid: false as const, saved: false as const, code, issues }
    super({
      ...codingError(code),
      ...diagnostic,
      message: `${codingError(code).message} Diagnostic: ${JSON.stringify(diagnostic)}`
    })
    this.diagnostic = diagnostic
  }
}

export function parseMaterialManifest(buffer: Buffer, phase: Phase) {
  if (buffer.length > 64 * 1024)
    throw new MaterialValidationError('CODING_MANIFEST_TOO_LARGE', [
      materialIssue('$', 'size', 'Keep the manifest within 64 KiB; export reports as separate files.')
    ])
  let value: unknown
  try {
    value = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new MaterialValidationError('CODING_MANIFEST_INVALID', [
      materialIssue('$', 'json', 'Provide a valid JSON object in delivery-manifest.json, without Markdown fences.')
    ])
  }
  const schema =
    phase === 'development'
      ? developmentManifestSchema
      : phase === 'deployment'
        ? deploymentManifestSchema
        : gitManifestSchema
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new MaterialValidationError(
      'CODING_MANIFEST_INVALID',
      parsed.error.issues.map((issue) =>
        issue.path.at(-1) === 'fileName'
          ? materialIssue(
              issue.path.join('.'),
              'file_name',
              'Use the exact exported basename (1–240 characters), without /, \\, NUL, or the dot-only names "." and "..". A local file path is not a fileName.'
            )
          : materialIssue(issue.path.join('.') || '$', issue.code, issue.message)
      )
    )
  }
  return parsed.data
}
