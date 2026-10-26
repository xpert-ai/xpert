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
export interface ContentEditorFile {
  editorKey: string
  projectId: string
  path: string
  title: string
}
/** Resource owner supplies current identity/location and owns atomic versions, independent of format. */
export interface ContentResourceEditor {
  describe(input: ContentSourceInput): Promise<ContentEditorFile>
  files?: {
    read(input: ContentSourceInput): Promise<{ buffer: Buffer; revision: string }>
    write(input: ContentSourceInput & { buffer: Buffer; expectedRevision: string }): Promise<{ revision: string }>
  }
}
export type ContentEditorInput = ContentDocumentScope & { source: ContentResourceReference; editorKey?: string }
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
  parameters?: { contentProvider: string; contentId?: string; contentTitle?: string; contentEditor?: string }
  editors?: ResourceContentEditorRegistration[]
}
/** Trusted scope only. Every operation checks Project, Assistant binding and resource permissions. */
export interface ContentEditorsApi {
  preferences(input: ContentDocumentScope & { contentId: string }): Promise<ContentEditorPreferenceState[]>
  setPreference(
    input: ContentDocumentScope & {
      contentId: string
      scope: ContentEditorPreferenceScope
      editorKey: string | null
      expectedRevision: number
    }
  ): Promise<ContentEditorPreferenceState>
  list(scope: ContentDocumentScope): Promise<ContentEditorRegistration[]>
  /** Prepare/validate bytes; does not create a resource or grant access to a destination. */
  prepare(
    scope: ContentDocumentScope & { editorKey: string; buffer?: Buffer }
  ): Promise<{ registration: FileContentEditorRegistration; buffer: Buffer }>
  resolve(input: ContentEditorInput): Promise<ContentEditorResolution>
  read(input: ContentEditorInput): Promise<ContentEditorResolution & { buffer: Buffer; revision: string }>
  write(input: ContentEditorInput & { buffer: Buffer; expectedRevision: string }): Promise<{ revision: string }>
}
export const ContentEditorsRuntimeCapability = createRuntimeCapability<ContentEditorsApi>('platform.content.editors', {
  description:
    'Discover editors, resolve authorized resources and exchange versioned file bytes without format-specific models.'
})
