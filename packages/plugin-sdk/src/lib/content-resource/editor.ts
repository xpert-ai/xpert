import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import type { ContentEditorRegistration, FileContentEditorRegistration } from '@xpert-ai/contracts'
import { BaseStrategyRegistry } from '../strategy'
import { STRATEGY_META_KEY } from '../types'
import { createRuntimeCapability } from '../core/runtime-capability'
import type { ContentDocumentModel, ContentDocumentScope } from './document'
import type { ContentResourceReference, ContentSourceInput } from './index'

/** File codecs expose no cells, blocks or plugin-specific edit operations to the platform. */
export interface ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration
  create(): Promise<Buffer>
  validateFile(buffer: Buffer): Promise<void>
}
export type IContentEditorProvider = ContentDocumentModel | ContentFileEditor
export function isTextContentEditor(provider: IContentEditorProvider): provider is ContentDocumentModel {
  return provider.descriptor.kind === 'text-document'
}
const EDITOR_PROVIDER = 'XPERT_CONTENT_EDITOR_PROVIDER'
export const ContentEditorProvider = (key: string) =>
  applyDecorators(SetMetadata(EDITOR_PROVIDER, key), SetMetadata(STRATEGY_META_KEY, EDITOR_PROVIDER))
@Injectable()
export class ContentEditorRegistry extends BaseStrategyRegistry<IContentEditorProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) { super(EDITOR_PROVIDER, discovery, reflector) }
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
export type ContentEditorInput = ContentDocumentScope & { source: ContentResourceReference }
export interface ContentEditorResolution {
  registration: ContentEditorRegistration
  file: ContentEditorFile
  canWrite: boolean
  viewKey: string
}
/** Trusted scope only. Every operation checks Project, Assistant binding and resource permissions. */
export interface ContentEditorsApi {
  list(scope: ContentDocumentScope): Promise<ContentEditorRegistration[]>
  /** Prepare/validate bytes; does not create a resource or grant access to a destination. */
  prepare(scope: ContentDocumentScope & { editorKey: string; buffer?: Buffer }): Promise<{ registration: FileContentEditorRegistration; buffer: Buffer }>
  resolve(input: ContentEditorInput): Promise<ContentEditorResolution>
  read(input: ContentEditorInput): Promise<ContentEditorResolution & { buffer: Buffer; revision: string }>
  write(input: ContentEditorInput & { buffer: Buffer; expectedRevision: string }): Promise<{ revision: string }>
}
export const ContentEditorsRuntimeCapability = createRuntimeCapability<ContentEditorsApi>('platform.content.editors', {
  description: 'Discover editors, resolve authorized resources and exchange versioned file bytes without format-specific models.'
})
