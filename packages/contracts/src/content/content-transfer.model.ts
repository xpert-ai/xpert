import type { AnalysisEvidenceSnapshot } from '../analytics/analysis-evidence.model'
import type { ContentSearchProjection } from './content-resource.model'

/** A fixed, bounded projection obtained by the host from an authorized source.
 * It creates a new editable resource; it never grants source access or implies synchronization. */
export interface ContentTextTransferSnapshot {
  schema: 'xpert.content-transfer@1'
  source: { providerKey: string; resourceId: string; revision: string; title: string }
  sections: ContentSearchProjection['sections']
}

/** Trusted producer output consumed by native Office and Motion adapters. */
export interface ContentAnalysisTransferSnapshot {
  schema: 'xpert.content-analysis-transfer@1'
  source: ContentTextTransferSnapshot['source']
  evidence: AnalysisEvidenceSnapshot
}
export type ContentTransferSnapshot = ContentTextTransferSnapshot | ContentAnalysisTransferSnapshot
