import { BadRequestException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { CONTENT_CATALOG_PROVIDER } from '@xpert-ai/contracts'
import {
    ContentEditorRegistry,
    ContentResourceProviderRegistry,
    ContentEditorsRuntimeCapability,
    isFileContentEditor,
    isResourceContentEditor,
    supportsContentModel,
    RuntimeCapabilityProvider,
    type ContentEditorsApi,
    type ContentEditorResolution,
    type ContentEditorInput,
    type IContentResourceProvider
} from '@xpert-ai/plugin-sdk'
import { ContentEditorPreferences } from './catalog/editor-preferences.service'
import { ContentResourceService } from './content-resource.service'
import { ContentDocumentAccess } from './documents/document-access.service'

/** The platform routes metadata and bytes; concrete edit semantics stay in the editor plugin. */
@Injectable()
@RuntimeCapabilityProvider(ContentEditorsRuntimeCapability)
export class ContentEditorsService implements ContentEditorsApi {
    constructor(
        private readonly editors: ContentEditorRegistry,
        private readonly resources: ContentResourceService,
        private readonly providers: ContentResourceProviderRegistry,
        private readonly access: ContentDocumentAccess,
        private readonly defaults: ContentEditorPreferences
    ) {}
    preferences(input: Parameters<ContentEditorsApi['preferences']>[0]) {
        return this.defaults.get(input)
    }
    setPreference(input: Parameters<ContentEditorsApi['setPreference']>[0]) {
        return this.defaults.set(input)
    }
    async list(scope: Parameters<ContentEditorsApi['list']>[0]) {
        await this.access.check(scope)
        return this.editors.listRegistrations(scope.actor.organizationId).map(({ strategy }) => strategy.descriptor)
    }
    async prepare(input: Parameters<ContentEditorsApi['prepare']>[0]) {
        await this.access.check(input, true)
        const editor = this.editors.get(input.editorKey, input.actor.organizationId)
        if (!isFileContentEditor(editor)) throw this.unavailable()
        const buffer = input.buffer ?? (await editor.create())
        await editor.validateFile(buffer)
        return { registration: editor.descriptor, buffer }
    }
    private async authorized(input: ContentEditorInput, write = false, provider?: IContentResourceProvider) {
        const permissions = await this.access.check(input, write)
        const resource = await this.resources.authorize({
            ...input.source,
            actor: input.actor,
            operation: write ? 'write' : 'read'
        })
        const source = (provider ?? this.providers.get(input.source.providerKey, input.actor.organizationId)).editor
        if (!source) throw this.unavailable()
        const scope = {
            actor: input.actor,
            projectId: input.projectId,
            assistantId: input.assistantId,
            sourceResourceId: input.source.resourceId
        }
        const file = await source.describe(scope)
        if (file.projectId !== input.projectId) this.access.denied()
        const editor = this.editors.get(file.editorKey, input.actor.organizationId)
        const registration = editor.descriptor
        return {
            source,
            scope,
            editor,
            result: {
                registration,
                file,
                canWrite: permissions.canWrite && resource.canWrite,
                viewKey: `${registration.view.providerKey}__${registration.view.viewKey}`
            }
        }
    }
    async resolve(input: ContentEditorInput): Promise<ContentEditorResolution> {
        await this.access.check(input)
        const provider =
            input.source.providerKey === CONTENT_CATALOG_PROVIDER
                ? undefined
                : this.providers.get(input.source.providerKey, input.actor.organizationId)
        if (input.source.providerKey === CONTENT_CATALOG_PROVIDER || provider?.catalog) {
            const item =
                input.source.providerKey === CONTENT_CATALOG_PROVIDER
                    ? await this.resources.catalog.get({ ...input, contentId: input.source.resourceId })
                    : await this.resources.catalog.register(input)
            if (item.deleted) throw this.unavailable()
            const editors = this.editors
                .listRegistrations(input.actor.organizationId)
                .map((item) => item.strategy)
                .filter(isResourceContentEditor)
                .map((item) => item.descriptor)
                .filter((editor) => supportsContentModel(editor, item, 'view'))
                .sort((a, b) => a.key.localeCompare(b.key))
            // Indexed legacy text/file entries still use their original codec and document ID.
            // Do not create a resource editor or a second collaboration stream for the backfill.
            const native = !editors.length
                ? this.providers.get(item.resourceRef.providerKey, input.actor.organizationId)
                : undefined
            if (native?.editor) {
                const legacy = await this.authorized({ ...input, source: item.resourceRef }, false, native)
                if (input.editorKey && input.editorKey !== legacy.result.registration.key) throw this.unavailable()
                return {
                    ...legacy.result,
                    resource: item,
                    selectionId: item.resourceRef.resourceId,
                    parameters: {
                        contentProvider: item.resourceRef.providerKey,
                        contentId: item.contentId,
                        contentTitle: item.title
                    }
                }
            }
            const preferredKeys = [...(await this.defaults.keys(input, item)), item.defaultEditorKey]
            const registration = input.editorKey
                ? editors.find((editor) => editor.key === input.editorKey)
                : (preferredKeys.map((key) => editors.find((editor) => editor.key === key)).find(Boolean) ?? editors[0])
            if (!registration) throw this.unavailable()
            return {
                registration,
                resource: item,
                canWrite: item.canWrite && supportsContentModel(registration, item, 'edit'),
                editors,
                viewKey: `${registration.view.providerKey}__${registration.view.viewKey}`,
                selectionId: item.resourceRef.resourceId,
                parameters: {
                    contentProvider: item.resourceRef.providerKey,
                    contentId: item.contentId,
                    contentTitle: item.title,
                    contentEditor: registration.key
                }
            }
        }
        return (await this.authorized(input, false, provider)).result
    }
    async read(input: ContentEditorInput) {
        const { source, scope, editor, result } = await this.authorized(input)
        if (!source.files || !isFileContentEditor(editor)) throw this.unavailable()
        const file = await source.files.read(scope)
        await editor.validateFile(file.buffer)
        return { ...result, ...file }
    }
    async write(input: Parameters<ContentEditorsApi['write']>[0]) {
        const { source, scope, editor, result } = await this.authorized(input, true)
        if (!result.canWrite) this.access.denied()
        if (!source.files || !isFileContentEditor(editor)) throw this.unavailable()
        await editor.validateFile(input.buffer)
        return source.files.write({ ...scope, buffer: input.buffer, expectedRevision: input.expectedRevision })
    }
    private unavailable() {
        return new BadRequestException(t('server-ai:Error.ContentEditorUnavailable'))
    }
}
