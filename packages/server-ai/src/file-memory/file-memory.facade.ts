import { Inject, Injectable } from '@nestjs/common'
import { TFile, TFileDirectory } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { FileMemoryDreamService } from './dream.service'
import {
    FileMemoryGetInput,
    FileMemorySearchInput,
    FileMemoryService,
    FileMemoryWriteInput
} from './file-memory.service'
import { getXpertFileMemoryVolumeScope, getXpertFileMemoryWorkspacePath } from './paths'
import { FileMemoryXpertScopeResolver } from './ports'
import { FileMemoryDreamConfig, FileMemoryDreamRequest } from './types'

@Injectable()
export class FileMemoryFacade {
    constructor(
        private readonly scopeResolver: FileMemoryXpertScopeResolver,
        private readonly fileMemoryService: FileMemoryService,
        private readonly fileMemoryDreamService: FileMemoryDreamService,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {}

    async getMemoryFiles(id: string, path?: string, deepth?: number): Promise<TFileDirectory[]> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert.tenantId, RequestContext.currentUserId(), xpert.id).list(
            getXpertFileMemoryWorkspacePath(xpert.id),
            {
                path,
                deepth
            }
        )
    }

    async getMemoryFile(id: string, filePath: string): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert.tenantId, RequestContext.currentUserId(), xpert.id).readFile(
            getXpertFileMemoryWorkspacePath(xpert.id),
            filePath
        )
    }

    async saveMemoryFile(id: string, filePath: string, content: string): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert.tenantId, RequestContext.currentUserId(), xpert.id).saveFile(
            getXpertFileMemoryWorkspacePath(xpert.id),
            filePath,
            content
        )
    }

    async uploadMemoryFile(
        id: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const xpert = await this.scopeResolver.resolve(id)
        return this.createWorkspaceVolumeClient(xpert.tenantId, RequestContext.currentUserId(), xpert.id).uploadFile(
            getXpertFileMemoryWorkspacePath(xpert.id),
            folderPath,
            file
        )
    }

    async deleteMemoryFile(id: string, filePath: string): Promise<void> {
        const xpert = await this.scopeResolver.resolve(id)
        await this.createWorkspaceVolumeClient(xpert.tenantId, RequestContext.currentUserId(), xpert.id).deleteFile(
            getXpertFileMemoryWorkspacePath(xpert.id),
            filePath
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

    private createWorkspaceVolumeClient(tenantId: string, _userId: string, xpertId: string) {
        return new VolumeSubtreeClient(this.volumeClient.resolve(getXpertFileMemoryVolumeScope(tenantId, xpertId)), {
            allowRootWorkspace: true
        })
    }
}
