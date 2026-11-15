import { getXpertFileMemoryVolumeScope } from './adapters/xpert-memory-volume'
import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { EventNameXpertValidate, type XpertDraftValidateEvent } from '../xpert/types'
import { validateStandardReplyDraft } from '../plugins/file-memory/standard-reply.capability'
import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { FileMemoryDreamService } from '../plugins/file-memory/dream.service'
import {
    FileMemoryGetInput,
    FileMemorySearchInput,
    FileMemoryService,
    FileMemoryWriteInput
} from '../plugins/file-memory/file-memory.service'
import { getXpertFileMemoryWorkspacePath } from '../plugins/file-memory/paths'
import { FileMemoryXpertScopeResolver } from '../plugins/file-memory/ports'
import { FileMemoryDreamConfig, FileMemoryDreamRequest } from '../plugins/file-memory/types'

@Injectable()
export class FileMemoryFacade {
    constructor(
        private readonly scopeResolver: FileMemoryXpertScopeResolver,
        private readonly fileMemoryService: FileMemoryService,
        private readonly fileMemoryDreamService: FileMemoryDreamService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    @OnEvent(EventNameXpertValidate, { suppressErrors: false })
    validateDraft({ draft }: XpertDraftValidateEvent) {
        validateStandardReplyDraft(draft)
    }

    async getMemoryFiles(id: string, path?: string, deepth?: number): Promise<TFileDirectory[]> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert).list(getXpertFileMemoryWorkspacePath(xpert.id), {
            path,
            deepth
        })
    }

    async getMemoryFile(id: string, filePath: string): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert).readFile(getXpertFileMemoryWorkspacePath(xpert.id), filePath)
    }

    async saveMemoryFile(id: string, filePath: string, content: string): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryService.withTopicWriteLock(xpert, () =>
            this.createWorkspaceVolumeClient(xpert).saveFile(
                getXpertFileMemoryWorkspacePath(xpert.id),
                filePath,
                content
            )
        )
    }

    async uploadMemoryFile(
        id: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryService.withTopicWriteLock(xpert, () =>
            this.createWorkspaceVolumeClient(xpert).uploadFile(
                getXpertFileMemoryWorkspacePath(xpert.id),
                folderPath,
                file
            )
        )
    }

    async deleteMemoryFile(id: string, filePath: string): Promise<void> {
        const xpert = await this.scopeResolver.resolve(id)
        await this.fileMemoryService.withTopicWriteLock(xpert, () =>
            this.createWorkspaceVolumeClient(xpert).deleteFile(getXpertFileMemoryWorkspacePath(xpert.id), filePath)
        )
    }

    async writeFileMemory(id: string, input: FileMemoryWriteInput) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryService.writeMemory(xpert, input)
    }

    async searchFileMemory(id: string, input: FileMemorySearchInput) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryService.searchMemory(xpert, input)
    }

    async readFileMemory(id: string, input: FileMemoryGetInput) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryService.getMemory(xpert, input)
    }

    async triggerFileMemoryDream(id: string, input: FileMemoryDreamRequest) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.triggerDream(xpert, input)
    }

    async getFileMemoryDreamConfig(id: string) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.getDreamConfig(xpert)
    }

    async saveFileMemoryDreamConfig(id: string, input: FileMemoryDreamConfig) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.saveDreamConfig(xpert, input)
    }

    async listFileMemoryDreamRuns(id: string) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.listRuns(xpert)
    }

    async getFileMemoryDreamRun(id: string, runId: string) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.getRun(xpert, runId)
    }

    async cancelFileMemoryDreamRun(id: string, runId: string) {
        const xpert = await this.scopeResolver.resolve(id)
        return this.fileMemoryDreamService.cancelRun(xpert, runId)
    }

    private createWorkspaceVolumeClient(xpert: Awaited<ReturnType<FileMemoryXpertScopeResolver['resolve']>>) {
        return new VolumeSubtreeClient(
            this.volumeClient.resolve(
                getXpertFileMemoryVolumeScope(
                    xpert.tenantId,
                    xpert.id,
                    xpert.userId ?? RequestContext.currentUserId(),
                    xpert.workspaceDataScope
                )
            ),
            {
                allowRootWorkspace: true,
                beforeMutation: async (target) => {
                    const segments = target.replace(/\\/g, '/').split('/')
                    if (segments.includes('.dream') || segments.at(-1)?.toLowerCase() === 'memory.md') {
                        throw new ForbiddenException('Managed memory files are read-only')
                    }
                }
            }
        )
    }
}
