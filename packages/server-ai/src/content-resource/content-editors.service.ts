import { BadRequestException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { ContentEditorRegistry, ContentResourceProviderRegistry, ContentEditorsRuntimeCapability,
  isTextContentEditor, RuntimeCapabilityProvider, type ContentEditorsApi, type ContentEditorInput } from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from './content-resource.service'
import { ContentDocumentAccess } from './documents/document-access.service'

/** The platform routes metadata and bytes; concrete edit semantics stay in the editor plugin. */
@Injectable()
@RuntimeCapabilityProvider(ContentEditorsRuntimeCapability)
export class ContentEditorsService implements ContentEditorsApi {
  constructor(private readonly editors: ContentEditorRegistry, private readonly resources: ContentResourceService,
    private readonly providers: ContentResourceProviderRegistry, private readonly access: ContentDocumentAccess) {}
  async list(scope: Parameters<ContentEditorsApi['list']>[0]) {
    await this.access.check(scope)
    return this.editors.listRegistrations(scope.actor.organizationId).map(({ strategy }) => strategy.descriptor)
  }
  async prepare(input: Parameters<ContentEditorsApi['prepare']>[0]) {
    await this.access.check(input, true)
    const editor = this.editors.get(input.editorKey, input.actor.organizationId)
    if (isTextContentEditor(editor)) throw this.unavailable()
    const buffer = input.buffer ?? await editor.create()
    await editor.validateFile(buffer)
    return { registration: editor.descriptor, buffer }
  }
  private async authorized(input: ContentEditorInput, write = false) {
    const permissions = await this.access.check(input, write)
    const resource = await this.resources.authorize({ ...input.source, actor: input.actor, operation: write ? 'write' : 'read' })
    const source = this.providers.get(input.source.providerKey, input.actor.organizationId).editor
    if (!source) throw this.unavailable()
    const scope = { actor: input.actor, projectId: input.projectId, assistantId: input.assistantId, sourceResourceId: input.source.resourceId }
    const file = await source.describe(scope)
    if (file.projectId !== input.projectId) this.access.denied()
    const editor = this.editors.get(file.editorKey, input.actor.organizationId)
    const registration = editor.descriptor
    return { source, scope, editor, result: { registration, file, canWrite: permissions.canWrite && resource.canWrite,
      viewKey: `${registration.view.providerKey}__${registration.view.viewKey}` } }
  }
  async resolve(input: ContentEditorInput) { return (await this.authorized(input)).result }
  async read(input: ContentEditorInput) {
    const { source, scope, editor, result } = await this.authorized(input)
    if (!source.files || isTextContentEditor(editor)) throw this.unavailable()
    const file = await source.files.read(scope)
    await editor.validateFile(file.buffer)
    return { ...result, ...file }
  }
  async write(input: Parameters<ContentEditorsApi['write']>[0]) {
    const { source, scope, editor, result } = await this.authorized(input, true)
    if (!result.canWrite) this.access.denied()
    if (!source.files || isTextContentEditor(editor)) throw this.unavailable()
    await editor.validateFile(input.buffer)
    return source.files.write({ ...scope, buffer: input.buffer, expectedRevision: input.expectedRevision })
  }
  private unavailable() { return new BadRequestException(t('server-ai:Error.ContentEditorUnavailable')) }
}
