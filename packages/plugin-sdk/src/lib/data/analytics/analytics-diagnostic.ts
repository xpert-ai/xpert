import { parseAnalyticsDiagnostic, type AnalyticsDiagnostic } from '@xpert-ai/contracts'

/** Public diagnostics only; Error.message deliberately excludes unvalidated provider text. */
export class AnalyticsProviderError extends Error {
  readonly diagnostic: AnalyticsDiagnostic
  constructor(diagnostic: AnalyticsDiagnostic) {
    super('ANALYTICS_PROVIDER_ERROR')
    this.name = 'AnalyticsProviderError'
    const parsed = parseAnalyticsDiagnostic(diagnostic)
    if (!parsed) throw new Error('ANALYTICS_DIAGNOSTIC_INVALID')
    this.diagnostic = parsed
    this.message = JSON.stringify(parsed)
  }
}

/** Structural lookup also accepts another SDK copy; class identity is not a trust boundary. */
export function readAnalyticsProviderDiagnostic(error: unknown): AnalyticsDiagnostic | undefined {
  if (!error || typeof error !== 'object') return undefined
  // Read own data properties only. Do not invoke getters on foreign exceptions.
  try {
    const name = Object.getOwnPropertyDescriptor(error, 'name')
    const diagnostic = Object.getOwnPropertyDescriptor(error, 'diagnostic')
    if (name?.value !== 'AnalyticsProviderError' || !diagnostic || !('value' in diagnostic)) return undefined
    return parseAnalyticsDiagnostic(diagnostic.value)
  } catch {
    return undefined
  }
}
