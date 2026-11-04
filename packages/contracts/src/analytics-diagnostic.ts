import { z } from 'zod/v3'

// Public diagnostics are authored separately from driver errors. This is defense in depth,
// not a sanitizer for arbitrary logs: producers must never copy raw exceptions into message.
const privateText =
  /[\u0000-\u001f\u007f]|(?:https?|jdbc|postgres(?:ql)?|mysql):|\b(?:password|passwd|pwd|secret|token|authorization|cookie|api[_-]?key)\s*[:=]|\bBearer\s|-----BEGIN|\b(?:SELECT|WITH)\b[\s\S]*\bFROM\b|\b(?:INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b|<\/?[a-z][^>]*>|(?:\/Users\/|\/home\/|\/private\/|[A-Z]:\\)|\bat\s+\S+\s*\(/i
const publicText = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .refine((value) => !privateText.test(value))
const reference = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)

/** Portable HTTP/provider failure contract. No arbitrary details, cause, query or connection fields. */
export const analyticsDiagnosticSchema = z
  .object({
    schema: z.literal('xpert.analytics.diagnostic'),
    version: z.literal(1),
    code: z.string().regex(/^[A-Z][A-Z0-9_-]{2,79}$/),
    stage: z.enum(['request', 'source', 'validation', 'authorization', 'execution', 'result', 'dependency']),
    message: publicText,
    retryable: z.boolean(),
    upstreamExecutionId: reference.optional(),
    auditRef: reference.optional()
  })
  .strict()
  .refine((value) => !value.retryable || value.stage === 'execution' || value.stage === 'dependency')

type ParsedDiagnostic = z.infer<typeof analyticsDiagnosticSchema>
export type AnalyticsDiagnostic = Required<Omit<ParsedDiagnostic, 'upstreamExecutionId' | 'auditRef'>> &
  Pick<ParsedDiagnostic, 'upstreamExecutionId' | 'auditRef'>

/** Invalid provider diagnostics fail closed; never return Zod errors containing received input. */
export function parseAnalyticsDiagnostic(value: unknown): AnalyticsDiagnostic | undefined {
  try {
    if (!value || typeof value !== 'object') return undefined
    const properties = Object.getOwnPropertyDescriptors(value)
    if (Object.values(properties).some((property) => !('value' in property))) return undefined
    const parsed = analyticsDiagnosticSchema.safeParse(
      Object.fromEntries(Object.entries(properties).map(([key, property]) => [key, property.value]))
    )
    if (!parsed.success) return undefined
    const { schema, version, code, stage, message, retryable, upstreamExecutionId, auditRef } = parsed.data
    return {
      schema,
      version,
      code,
      stage,
      message,
      retryable,
      ...(upstreamExecutionId ? { upstreamExecutionId } : {}),
      ...(auditRef ? { auditRef } : {})
    }
  } catch {
    return undefined
  }
}
