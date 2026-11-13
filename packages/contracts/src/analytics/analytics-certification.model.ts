/** Source-issued business approval checked for this execution, never a promise of future validity. */
export type AnalyticsCertification = {
  kind: 'business_metric'
  subjectId: string
  verifiedAt: string
} & (
  | { status: 'legacy_unverified' }
  | {
      status: 'verified'
      definitionHash: string
      dependency: { id: string; version: number }
      certifiedBy: string
      certifiedAt: string
    }
)
