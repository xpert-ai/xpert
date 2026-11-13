import type { AnalyticalDataset, AnalyticsValue } from './analytics-query.model'

/** Immutable query evidence. Certification and freshness describe capture time, never current authority.
 * Readers must reauthorize the source; this document contains no query payload or credentials. */
export interface AnalysisEvidenceSnapshot {
  schema: 'xpert.analysis-evidence@1'
  id: string
  title: string
  capturedAt: string
  source: { artifactId: string; versionId: string; projectId: string }
  controls: Record<string, AnalyticsValue>
  /** A bounded, exact copy of normalized results, including units, completeness and source proofs. */
  datasets: AnalyticalDataset[]
  /** Facts cite exact cells. Interpretation is explicitly separate from observed data. */
  statements: Array<{
    kind: 'fact' | 'inference' | 'unverified'
    text: string
    citations: Array<{ datasetId: string; row: number; field: string }>
  }>
  /** SHA-256 of the canonical snapshot excluding this field. Not a permission token. */
  sha256: string
}
