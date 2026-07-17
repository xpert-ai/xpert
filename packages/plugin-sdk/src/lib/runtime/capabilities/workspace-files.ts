import { createRuntimeCapability } from '../../core/runtime-capability'

/** Logical workspace volume catalog supported by plugin-facing file APIs. */
export type WorkspaceFileCatalog = 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts'

/** Stable source identifier for portable workspace file references. */
export const WORKSPACE_FILES_SOURCE = 'platform.workspace.files' as const

/**
 * Scope fields used to resolve a workspace Volume.
 *
 * Explicit APIs can provide catalog plus the matching id directly. Runtime-aware
 * APIs usually receive these fields from the current Agent execution context.
 */
export type WorkspaceFileScope = {
  tenantId?: string | null
  userId?: string | null
  catalog?: WorkspaceFileCatalog | null
  scopeId?: string | null
  projectId?: string | null
  knowledgeId?: string | null
  rootId?: string | null
  xpertId?: string | null
  isolateByUser?: boolean | null
}

/**
 * Input for uploading raw bytes into an explicitly scoped workspace Volume.
 *
 * Use `writeRuntimeBuffer()` instead when a plugin writes into the current Agent
 * runtime workspace and wants the platform to infer project/Xpert scope.
 */
export type WorkspaceUploadBufferInput = WorkspaceFileScope & {
  buffer: Buffer
  originalName: string
  mimeType?: string | null
  size?: number | null
  folder?: string | null
  fileName?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Scoped reference to an existing workspace file.
 *
 * `filePath` is always a Volume-relative path, not a sandbox absolute path such
 * as `/workspace/...` and not a host/API-process filesystem path.
 */
export type WorkspaceFileReference = WorkspaceFileScope & {
  filePath: string
}

/**
 * Agent-facing locator for a file in the current runtime workspace.
 *
 * Callers may provide sandbox paths such as `/workspace/report.docx`,
 * workspace-relative paths such as `report.docx`, or metadata aliases commonly
 * produced by tool calls.
 */
export type WorkspaceRuntimeFileDescriptor = {
  path?: string | null
  filePath?: string | null
  workspacePath?: string | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  mimetype?: string | null
  size?: number | null
}

/**
 * Persistable workspace file reference produced by the platform.
 *
 * Unlike a sandbox absolute path, this reference carries enough scope metadata
 * to read the same file later from queues, callbacks, or async jobs.
 */
export type WorkspacePortableFileReference = WorkspaceFileReference & {
  source: typeof WORKSPACE_FILES_SOURCE
  workspacePath: string
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  size?: number | null
}

/** Input accepted by runtime-aware workspace file APIs. */
export type WorkspaceFileLocator = string | WorkspaceRuntimeFileDescriptor | WorkspacePortableFileReference

/**
 * Metadata returned by workspace file operations.
 *
 * `filePath` is the stable Volume-relative path. `workspacePath` is the
 * runtime/sandbox-facing path when one is available.
 */
export type WorkspaceFile = {
  name: string
  filePath: string
  workspacePath: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog: WorkspaceFileCatalog
  scopeId?: string
  metadata?: Record<string, unknown>
}

/** Workspace file metadata plus raw file bytes. */
export type WorkspaceFileBuffer = WorkspaceFile & {
  buffer: Buffer
}

/** Workspace file bytes plus the portable reference used to retrieve them. */
export type WorkspaceRuntimeFileBuffer = WorkspaceFileBuffer & {
  reference: WorkspacePortableFileReference
}

/**
 * Runtime-aware write input for bytes created by tools or plugins.
 *
 * If a path is provided, it is interpreted as a workspace path in the scoped
 * runtime, not as a host/API-process filesystem path.
 */
export type WorkspaceRuntimeWriteInput = WorkspaceFileScope &
  WorkspaceRuntimeFileDescriptor & {
    buffer: Buffer
    originalName?: string | null
    folder?: string | null
    fileName?: string | null
    metadata?: Record<string, unknown>
  }

/**
 * Input for registering an existing workspace file with the file-understanding
 * pipeline.
 *
 * The file must already exist in the scoped workspace Volume identified by
 * `filePath` and the scope fields.
 */
export type WorkspaceUnderstandFileInput = WorkspaceFileReference & {
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
  fileUrl?: string | null
  url?: string | null
  purpose?: 'chat_attachment' | 'workspace' | 'knowledge'
  parseMode?: 'auto' | 'fast' | 'deep' | 'none'
  conversationId?: string | null
  threadId?: string | null
  projectId?: string | null
  xpertId?: string | null
  metadata?: Record<string, unknown>
  runInline?: boolean | null
}

/** File-understanding asset metadata created from a workspace file. */
export type WorkspaceUnderstoodFile = WorkspaceFile & {
  id: string
  fileId: string
  fileAssetId: string
  storageFileId?: string
  originalName?: string
  status: string
  parseStatus: string
  purpose?: string
  parseMode?: string
  capabilities?: string[]
  summary?: string
}

/**
 * Runtime capability contract for reading, writing, uploading, deleting, and
 * understanding files in Xpert workspace Volumes.
 */
export interface WorkspaceFilesApi {
  /** Upload raw bytes into an explicitly scoped workspace Volume. */
  uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile>

  /** Register an existing workspace file with the platform understanding pipeline. */
  understandFile(input: WorkspaceUnderstandFileInput): Promise<WorkspaceUnderstoodFile>

  /**
   * Resolve metadata and an openable URL for an explicitly scoped workspace
   * file without reading its bytes into the API process.
   */
  resolveFile(input: WorkspaceFileReference): Promise<WorkspaceFile>

  /** Read raw bytes from an explicitly scoped workspace file reference. */
  readBuffer(input: WorkspaceFileReference): Promise<WorkspaceFileBuffer>

  /** Delete an explicitly scoped workspace file. */
  deleteFile(input: WorkspaceFileReference): Promise<void>

  /**
   * Normalize a runtime locator into a portable, scope-aware reference without
   * reading the file bytes.
   */
  resolveRuntimeReference(input: WorkspaceFileLocator): Promise<WorkspacePortableFileReference>

  /**
   * Read bytes from a runtime locator using the current Agent workspace scope.
   *
   * This is the preferred API for plugin tools that receive `/workspace/...`
   * paths from sandbox commands.
   */
  readRuntimeBuffer(input: WorkspaceFileLocator): Promise<WorkspaceRuntimeFileBuffer>

  /**
   * Write bytes into the current runtime workspace and return a portable
   * reference suitable for delayed processing or queue retries.
   */
  writeRuntimeBuffer(
    input: WorkspaceRuntimeWriteInput
  ): Promise<WorkspaceFile & { reference: WorkspacePortableFileReference }>
}

export const WorkspaceFilesRuntimeCapability = createRuntimeCapability<WorkspaceFilesApi>('platform.workspace.files', {
  description: 'Upload, understand, resolve, read, and delete raw files in Xpert workspace volumes.'
})
