import { createRuntimeCapability } from '../../core/runtime-capability'

export type KnowledgeDocumentVisualCandidateReason =
  | 'same_block'
  | 'same_chunk'
  | 'same_page'
  | 'adjacent_page'
  | 'visual_summary_match'
  | 'visual_only_fallback'

export type KnowledgeDocumentVisualTextAnchor = {
  page?: number
  chunkId?: string
  sourceBlockIds?: string[]
}

export type KnowledgeDocumentVisualBusinessScope = {
  namespace: 'bom.requirement-evidence'
  caseId: string
  baselineId: string
  runId: string
  sourceDocumentId: string
}

export type KnowledgeDocumentVisualCandidateRequest = {
  knowledgebaseId: string
  knowledgeDocumentId: string
  query: string
  textAnchors: KnowledgeDocumentVisualTextAnchor[]
  maxAssets: number
  businessScope: KnowledgeDocumentVisualBusinessScope
}

export type KnowledgeDocumentVisualCandidate = {
  /**
   * Execution-scoped logical path returned by a governed KnowledgeDocument search. This is not a
   * host filesystem path and can only be resolved again by the knowledgebase image viewer.
   */
  filePath: string
  knowledgeDocumentId: string
  sourceDocumentId: string
  page?: number
  chunkId?: string
  sourceBlockIds: string[]
  visualAssetId: string
  candidateReason: KnowledgeDocumentVisualCandidateReason
  summary?: string
}

export type KnowledgeDocumentVisualCandidateResult = {
  candidates: KnowledgeDocumentVisualCandidate[]
  warnings: string[]
}

export type KnowledgeDocumentViewImagesInput = {
  filePaths: string[]
}

export type KnowledgeDocumentViewedImage = Omit<KnowledgeDocumentVisualCandidate, 'filePath'> & {
  index: number
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
}

export type KnowledgeDocumentViewImagesResult = {
  batchRef: string
  images: KnowledgeDocumentViewedImage[]
}

export type KnowledgeDocumentVisualImagePayload = KnowledgeDocumentViewedImage & {
  dataBase64: string
}

export interface KnowledgeDocumentVisualAssetsApi {
  issueCandidates(input: KnowledgeDocumentVisualCandidateRequest): Promise<KnowledgeDocumentVisualCandidateResult>

  prepareImages(input: KnowledgeDocumentViewImagesInput): Promise<KnowledgeDocumentViewImagesResult>

  consumeImageBatch(batchRef: string): Promise<KnowledgeDocumentVisualImagePayload[]>

  discardImageBatch(batchRef: string): Promise<void>
}

export const KnowledgeDocumentVisualAssetsRuntimeCapability = createRuntimeCapability<KnowledgeDocumentVisualAssetsApi>(
  'platform.knowledgebase.visual-assets',
  {
    description:
      'Issue execution-scoped logical KnowledgeDocument image paths and inject validated images without exposing host storage paths.'
  }
)
