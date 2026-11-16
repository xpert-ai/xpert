import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { extname, basename } from 'node:path'
import { t } from 'i18next'
import {
    ContentEditorRegistry,
    ContentResourceProviderRegistry,
    isFileContentEditor,
    type ContentFileEditorInput
} from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from './content-resource.service'
import { ContentDocumentAccess } from './documents/document-access.service'
import { ContentFileOwnershipService } from '../shared/volume/content-file-ownership.service'
import { checkedWorkspacePath } from '../shared/volume/workspace-file-io'
import { ProjectFilesRuntimeService } from '../xpert-project/services/project-files-runtime.service'

/** Unmanaged Project files keep their original path. Owned files are routed through their live provider. */
@Injectable()
export class ContentFileEditors {
    constructor(
        private readonly access: ContentDocumentAccess,
        private readonly registry: ContentEditorRegistry,
        private readonly ownership: ContentFileOwnershipService,
        private readonly files: ProjectFilesRuntimeService,
        private readonly providers: ContentResourceProviderRegistry,
        private readonly resources: ContentResourceService
    ) {}
    async owner(input: ContentFileEditorInput) {
        await this.access.check(input)
        const path = checkedWorkspacePath(input.path)
        const retained = await this.ownership.findFileResource(input.actor.tenantId, input.projectId, path)
        if (retained) return retained
        for (const { type, strategy } of this.providers.listRegistrations(input.actor.organizationId)) {
            const resourceId = await strategy.catalog?.resolveFile?.({ ...input, path })
            if (!resourceId) continue
            const source = { providerKey: type, resourceId }
            await this.resources.catalog.register({ ...input, source })
            return source
        }
        return null
    }
    private async codec(input: ContentFileEditorInput, write = false) {
        const access = await this.access.check(input, write)
        checkedWorkspacePath(input.path)
        if (await this.owner(input)) throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
        await this.ownership.assertUnmanaged(input.actor.tenantId, input.projectId, input.path)
        const extension = extname(input.path).toLowerCase().replace(/^\./, '')
        const codec = this.registry
            .listRegistrations(input.actor.organizationId)
            .map((item) => item.strategy)
            .filter(isFileContentEditor)
            .filter((editor) => editor.descriptor.extension.replace(/^\./, '').toLowerCase() === extension)
            .sort((a, b) => a.descriptor.key.localeCompare(b.descriptor.key))
            .find((editor) => !input.editorKey || editor.descriptor.key === input.editorKey)
        if (!codec) throw new BadRequestException(t('server-ai:Error.ContentEditorUnavailable'))
        return { codec, access }
    }
    async read(input: ContentFileEditorInput) {
        const { codec, access } = await this.codec(input)
        const file = await this.files.read(input)
        await codec.validateFile(file.buffer)
        const registration = codec.descriptor
        // Stable tab identity, never an authorization token or persisted content-resource identity.
        const selectionId = createHash('sha256').update(`${input.projectId}:${input.path}`).digest('hex')
        return {
            registration,
            file: {
                editorKey: registration.key,
                projectId: input.projectId,
                path: input.path,
                title: basename(input.path)
            },
            canWrite: access.canWrite,
            viewKey: `${registration.view.providerKey}__${registration.view.viewKey}`,
            selectionId,
            parameters: {
                contentProvider: 'platform.workspace.file',
                filePath: input.path,
                contentEditor: registration.key
            },
            buffer: file.buffer,
            revision: file.sha256
        }
    }
    async write(input: ContentFileEditorInput & { buffer: Buffer; expectedRevision: string }) {
        const { codec } = await this.codec(input, true)
        await codec.validateFile(input.buffer)
        const result = await this.files.writeUnmanaged({ ...input, expectedHash: input.expectedRevision })
        return { revision: result.sha256 }
    }
}
