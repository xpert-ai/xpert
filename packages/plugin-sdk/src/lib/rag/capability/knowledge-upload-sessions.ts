/** Persisted upload progress within one knowledgebase; completion does not imply document import or processing. */
export type KnowledgeUploadSession = {
  /** Host-generated session UUID, used together with the owning knowledgebaseId. */
  id: string
  /** Display file name; not a storage path. */
  name: string
  /** Expected total file size in bytes. */
  size: number
  /** Host-selected part size in bytes; only the final part may be shorter. */
  chunkSize: number
  /** Persisted zero-based part indexes, sorted in ascending order; gaps identify missing parts. */
  received: number[]
  /** Lowercase hexadecimal SHA-256 of each received part, keyed by its decimal index. */
  partHashes: Record<string, string>
  /** True after complete() verifies all expected parts and records the whole-file hash. */
  complete: boolean
  /** Lowercase hexadecimal SHA-256 of the whole file, available after successful completion. */
  sha256?: string
}

/** Server-only staged uploads exposed through Documents.uploads. Every operation revalidates Knowledge write access. */
export interface KnowledgeUploadSessionsApi {
  /**
   * Create a new upload session without creating or processing a document.
   * size is the total byte count (positive, currently at most 2 GiB); use the returned chunkSize for part boundaries.
   */
  create(input: { knowledgebaseId: string; name: string; size: number }): Promise<KnowledgeUploadSession>

  /** Read persisted progress and part hashes to resume an existing session, including after a server restart. */
  status(input: { knowledgebaseId: string; sessionId: string }): Promise<KnowledgeUploadSession>

  /**
   * Persist one zero-based part; parts may arrive out of order.
   * buffer must match the expected part length and sha256 must be its lowercase hexadecimal SHA-256.
   * Retrying identical bytes is safe; conflicting bytes for an existing index are rejected.
   */
  append(input: {
    knowledgebaseId: string
    sessionId: string
    index: number
    buffer: Buffer
    sha256: string
  }): Promise<void>

  /**
   * Verify all parts and their lengths, then record the whole-file SHA-256 and mark the session complete.
   * Incomplete uploads fail; repeated completion is safe. Does not import documents or start processing.
   */
  complete(input: { knowledgebaseId: string; sessionId: string }): Promise<KnowledgeUploadSession>

  /**
   * Read bytes from a completed upload, including ranges that cross part boundaries, for streaming ZIP readers.
   * offset is zero-based; length is nonnegative, at most chunkSize, and offset + length must not exceed size.
   */
  read(input: { knowledgebaseId: string; sessionId: string; offset: number; length: number }): Promise<Buffer>

  /** Delete an existing session and its staged bytes; previously imported documents are unaffected. */
  remove(input: { knowledgebaseId: string; sessionId: string }): Promise<void>
}
