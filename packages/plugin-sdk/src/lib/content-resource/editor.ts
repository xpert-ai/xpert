import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type {
  ContentEditorRegistration,
  FileContentEditorRegistration,
  ResourceContentEditorRegistration
} from '@xpert-ai/contracts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ContentDocumentModel, ContentDocumentScope } from './document'
import type { ContentResourceReference, ContentSourceInput } from './index'
import type { CollaborationSessionDescriptor } from '../collaboration/types'
import type { WorkspacePortableFileReference } from '../runtime/capabilities/workspace-files'
export { supportsContentModel } from './editor-compatibility'

/** File codecs expose no cells, blocks or plugin-specific edit operations to the platform. */
export interface ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration
  create(): Promise<Buffer>
  validateFile(buffer: Buffer): Promise<void>
}
export interface ContentResourceEditorImplementation {
  readonly descriptor: ResourceContentEditorRegistration
}
export type IContentEditorProvider = ContentDocumentModel | ContentFileEditor | ContentResourceEditorImplementation
export function isTextContentEditor(provider: IContentEditorProvider): provider is ContentDocumentModel {
  return provider.descriptor.kind === 'text-document'
}
export function isFileContentEditor(provider: IContentEditorProvider): provider is ContentFileEditor {
  return provider.descriptor.kind === 'file'
}
export function isResourceContentEditor(
  provider: IContentEditorProvider
): provider is ContentResourceEditorImplementation {
  return provider.descriptor.kind === 'resource'
}
const EDITOR_PROVIDER = 'XPERT_CONTENT_EDITOR_PROVIDER'
export const ContentEditorProvider = (key: string) =>
  applyDecorators(SetMetadata(EDITOR_PROVIDER, key), SetMetadata(STRATEGY_META_KEY, EDITOR_PROVIDER))
@Injectable()
export class ContentEditorRegistry extends BaseStrategyRegistry<IContentEditorProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(EDITOR_PROVIDER, discovery, reflector)
  }
  getTextModel(key: string, organizationId: string): ContentDocumentModel {
    const provider = this.get(key, organizationId)
    if (!isTextContentEditor(provider)) throw new Error('Editor does not implement the text document protocol')
    return provider
  }
}
/** File authority belongs to a Project or a standalone Assistant; at least one identity is required. */
export type ContentFileScope =
  | ContentDocumentScope
  | { actor: ContentDocumentScope['actor']; assistantId: string; projectId?: never }
export type ContentEditorFile = (Omit<ContentDocumentScope, 'actor'> | { assistantId: string; projectId?: never }) & {
  editorKey: string
  path: string
  title: string
}
/** Resource owner supplies current identity/location and owns atomic versions, independent of format. */
export interface ContentResourceEditor {
  describe(input: ContentSourceInput): Promise<ContentEditorFile>
  files?: {
    read(input: ContentSourceInput): Promise<{ buffer: Buffer; revision: string; sequence?: number }>
    write(
      input: ContentSourceInput & { buffer: Buffer; expectedRevision: string }
    ): Promise<{ revision: string; sequence?: number }>
  }
  /** Presence and revision notifications only; file bytes remain owned by the CAS writer above. */
  createSession?(input: ContentSourceInput): Promise<CollaborationSessionDescriptor>
}
export type ContentEditorInput = ContentDocumentScope & { source: ContentResourceReference; editorKey?: string }
export type ContentFileEditorInput = ContentFileScope & { path: string; editorKey?: string }
export type ContentEditorPreferenceScope = 'resource' | 'project' | 'organization'
export interface ContentEditorPreferenceState {
  scope: ContentEditorPreferenceScope
  editorKey: string | null
  revision: number
  canSet: boolean
}
export interface ContentEditorResolution {
  registration: ContentEditorRegistration
  file?: ContentEditorFile
  resource?: import('@xpert-ai/contracts').ContentCatalogItem
  canWrite: boolean
  viewKey: string
  selectionId?: string
  parameters?: {
    contentProvider: string
    contentId?: string
    contentTitle?: string
    contentEditor?: string
    filePath?: string
  }
  editors?: ResourceContentEditorRegistration[]
}
/** Trusted scope only. Every operation checks the workspace authority and resource permissions. */
export interface ContentEditorsApi {
  /** Read resource, Project and organization editor preferences, including permission to change each scope. */
  preferences(input: ContentDocumentScope & { contentId: string }): Promise<ContentEditorPreferenceState[]>
  /** Set or clear a scoped preference using its exact revision; editorKey=null restores inherited selection. */
  setPreference(
    input: ContentDocumentScope & {
      contentId: string
      scope: ContentEditorPreferenceScope
      editorKey: string | null
      expectedRevision: number
    }
  ): Promise<ContentEditorPreferenceState>
  /** List editors available in the authorized scope; discovery alone does not grant access to a resource. */
  list(scope: ContentDocumentScope): Promise<ContentEditorRegistration[]>
  /** Validate supplied bytes or create a blank file with the selected codec; does not persist a resource. */
  prepare(
    scope: ContentDocumentScope & { editorKey: string; buffer?: Buffer }
  ): Promise<{ registration: FileContentEditorRegistration; buffer: Buffer }>
  /** Resolve an authorized resource to a compatible editor and host navigation, honoring editor preferences. */
  resolve(input: ContentEditorInput): Promise<ContentEditorResolution>
  /** Resolve an authorized workspace path; a resource owner takes precedence over a file codec. */
  resolveFile(input: ContentFileEditorInput): Promise<ContentEditorResolution>
  /** Read an authorized unmanaged workspace file; its revision is the current content hash. */
  readFile(
    input: ContentFileEditorInput
  ): Promise<ContentEditorResolution & { buffer: Buffer; revision: string; reference: WorkspacePortableFileReference }>
  /** Validate and atomically replace an unmanaged file at expectedRevision; reject owned paths and stale hashes. */
  writeFile(input: ContentFileEditorInput & { buffer: Buffer; expectedRevision: string }): Promise<{ revision: string }>
  /** Read a resource owner's current file and opaque revision; sequence and collaboration are optional owner capabilities. */
  read(input: ContentEditorInput): Promise<
    ContentEditorResolution & {
      buffer: Buffer
      revision: string
      reference: WorkspacePortableFileReference
      sequence?: number
      collaboration?: boolean
    }
  >
  /** Validate bytes and publish through the owner using expectedRevision; the owner enforces atomic versions and history. */
  write(
    input: ContentEditorInput & { buffer: Buffer; expectedRevision: string }
  ): Promise<{ revision: string; sequence?: number }>
  /** Create an authorized presence/revision session when supported; file writes still use write(), not this channel. */
  createSession(input: ContentEditorInput): Promise<CollaborationSessionDescriptor>
}
export const ContentEditorsRuntimeCapability = createRuntimeCapability<ContentEditorsApi>('platform.content.editors', {
  description:
    'Discover editors, resolve authorized resources and exchange versioned file bytes without format-specific models.'
})
