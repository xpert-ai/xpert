import { createRuntimeCapability } from '../../core/runtime-capability'
import type { RuntimeIdentityScope } from '../runtime-scope'
import type { WorkspaceFilesApi, WorkspacePortableFileReference } from './workspace-files'

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
  /** Plugin-owned audit namespace; document authorization remains host-owned. */
  namespace: string
  attributes: Record<string, string>
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
  width?: number
  height?: number
  sha256: string
}

/**
 * Server-only materialization data used to create an immutable ArtifactVersion.
 *
 * This value is returned through the in-process runtime capability and must not
 * be copied into ToolMessage content or persisted chat metadata.
 */
export type KnowledgeDocumentPreparedImageArtifact = {
  index: number
  fileName: string
  workspaceFileRef: WorkspacePortableFileReference
}

export type KnowledgeDocumentViewImagesResult = {
  batchRef: string
  images: KnowledgeDocumentViewedImage[]
  artifactInputs: KnowledgeDocumentPreparedImageArtifact[]
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

export type KnowledgeDocumentVisualAssetsRuntimeDependencies = {
  /** File writer already bound to the authorized project/workspace. */
  workspaceFiles: WorkspaceFilesApi
  /** Optional host resolver for child executions whose identity is assigned after graph construction. */
  resolveExecutionScope?: () => RuntimeIdentityScope
}

export interface KnowledgeDocumentVisualAssetsRuntimeFactory {
  /** Every API owns a fresh allow-list; supplied scope must identify an authorized execution. */
  createScopedApi(
    scope: RuntimeIdentityScope,
    dependencies: KnowledgeDocumentVisualAssetsRuntimeDependencies
  ): KnowledgeDocumentVisualAssetsApi
}

export const KnowledgeDocumentVisualAssetsRuntimeFactoryCapability =
  createRuntimeCapability<KnowledgeDocumentVisualAssetsRuntimeFactory>(
    'platform.knowledge-document.visual-assets.factory',
    {
      description:
        'Create a visual-assets API with an execution-local image allow-list and authorized workspace writer.'
    }
  )
