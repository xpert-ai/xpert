import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { extname, basename } from 'node:path'
import { t } from 'i18next'
import {
    RequestContext,
    ContentEditorRegistry,
    ContentResourceProviderRegistry,
    isFileContentEditor,
    type ContentFileEditorInput
} from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from './content-resource.service'
import { ContentDocumentAccess } from './documents/document-access.service'
import { ContentFileOwnershipService } from '../shared/volume/content-file-ownership.service'
import { CommandBus } from '@nestjs/cqrs'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume'
import { ResolveAssistantFileAccessCommand } from '../xpert/assistant-files/resolve-assistant-file-access.command'
import { initializeTemplateFiles } from '../shared/volume/initialize-template-files'
import { checkedWorkspacePath, readWorkspaceFile, writeWorkspaceFile } from '../shared/volume/workspace-file-io'
import { ProjectFilesRuntimeService } from '../xpert-project/services/project-files-runtime.service'

/** Unmanaged workspace files keep their original path. Owned files use their live provider. */
@Injectable()
export class ContentFileEditors {
    constructor(
        private readonly access: ContentDocumentAccess,
        private readonly registry: ContentEditorRegistry,
        private readonly ownership: ContentFileOwnershipService,
        private readonly files: ProjectFilesRuntimeService,
        private readonly providers: ContentResourceProviderRegistry,
        private readonly resources: ContentResourceService,
        private readonly commands: CommandBus,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient
    ) {}
    private async authorize(input: ContentFileEditorInput, write = false) {
        if (input.projectId) return this.access.check({ ...input, projectId: input.projectId }, write)
        const access = await this.assistantAccess(input, write)
        return { canWrite: access.capabilities.canWrite }
    }
    private async assistantAccess(input: ContentFileEditorInput, write = false) {
        const { actor } = input
        if (
            !input.assistantId ||
            RequestContext.currentTenantId() !== actor.tenantId ||
            RequestContext.getOrganizationId() !== actor.organizationId ||
            RequestContext.currentUserId() !== actor.userId
        )
            throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
        await this.resources.identities.principal(actor)
        const result = await this.commands.execute(
            new ResolveAssistantFileAccessCommand(input.assistantId, write ? 'write' : 'read', 'runtime')
        )
        return result
    }
    private async assistantVolume(input: ContentFileEditorInput, write = false) {
        const access = await this.assistantAccess(input, write)
        const volume = await this.volumes.resolve(access.scope).ensureRoot()
        if (access.initialFiles) await initializeTemplateFiles(volume, access.initialFiles)
        return { volume, scope: access.scope }
    }
    async owner(input: ContentFileEditorInput) {
        await this.authorize(input)
        if (!input.projectId) return null
        const path = checkedWorkspacePath(input.path)
        const retained = await this.ownership.findFileResource(input.actor.tenantId, input.projectId, path)
        if (retained) return retained
        for (const { type, strategy } of this.providers.listRegistrations(input.actor.organizationId)) {
            const resourceId = await strategy.catalog?.resolveFile?.({ ...input, projectId: input.projectId, path })
            if (!resourceId) continue
            const source = { providerKey: type, resourceId }
            await this.resources.catalog.register({ ...input, projectId: input.projectId, source })
            return source
        }
        return null
    }
    private async codec(input: ContentFileEditorInput, write = false) {
        const access = await this.authorize(input, write)
        checkedWorkspacePath(input.path)
        if (await this.owner(input)) throw new ConflictException(t('server-ai:Error.ContentEditorWriteRequired'))
        if (input.projectId) await this.ownership.assertUnmanaged(input.actor.tenantId, input.projectId, input.path)
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
        const assistant = input.projectId ? undefined : await this.assistantVolume(input)
        const file = input.projectId
            ? await this.files.read({ ...input, projectId: input.projectId })
            : await readWorkspaceFile(assistant!.volume, input.path)
        await codec.validateFile(file.buffer)
        const registration = codec.descriptor
        // Stable tab identity, never an authorization token or persisted content-resource identity.
        const selectionId = createHash('sha256')
            .update(
                `${input.projectId ? 'project:' + input.projectId : 'assistant:' + input.assistantId}:${input.path}`
            )
            .digest('hex')
        return {
            registration,
            file: {
                editorKey: registration.key,
                ...(input.projectId
                    ? { projectId: input.projectId, assistantId: input.assistantId }
                    : { assistantId: input.assistantId!, projectId: undefined }),
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
            // Keep the authorized catalog: user-xperts and shared xperts have distinct roots.
            reference: {
                ...input.actor,
                ...(assistant
                    ? { ...assistant.scope, scopeId: assistant.scope.xpertId }
                    : { catalog: 'projects' as const, projectId: input.projectId, scopeId: input.projectId }),
                source: 'platform.workspace.files' as const,
                filePath: input.path,
                workspacePath: input.path
            },
            revision: file.sha256
        }
    }
    async write(input: ContentFileEditorInput & { buffer: Buffer; expectedRevision: string }) {
        const { codec } = await this.codec(input, true)
        await codec.validateFile(input.buffer)
        const result = input.projectId
            ? await this.files.writeUnmanaged({
                  ...input,
                  projectId: input.projectId,
                  expectedHash: input.expectedRevision
              })
            : await writeWorkspaceFile((await this.assistantVolume(input, true)).volume, input.path, input.buffer, {
                  expectedHash: input.expectedRevision,
                  authorize: () => this.authorize(input, true),
                  assertUnmanaged: () => undefined
              })
        return { revision: result.sha256 }
    }
}
