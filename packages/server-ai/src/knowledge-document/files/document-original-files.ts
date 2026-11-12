import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { IKnowledgeDocument, KDocumentSourceType } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { uniq } from 'lodash'
import { In } from 'typeorm'
import { KnowledgeWorkAreaResolver } from '../../shared/volume/work-area'
import type { KnowledgeDocumentService } from '../document.service'

export type OriginalFileDownloadTarget = {
    absolutePath: string
    fileName: string
    mimeType: string
}

export type OriginalFileDownload = OriginalFileDownloadTarget & {
    content: Buffer
}

function getUniqueFileName(fileName: string, usedFileNames: Set<string>) {
    if (!usedFileNames.has(fileName)) {
        usedFileNames.add(fileName)
        return fileName
    }

    const extensionStart = fileName.lastIndexOf('.')
    const hasExtension = extensionStart > 0
    const baseName = hasExtension ? fileName.slice(0, extensionStart) : fileName
    const extension = hasExtension ? fileName.slice(extensionStart) : ''
    let index = 2
    let nextName = `${baseName} (${index})${extension}`

    while (usedFileNames.has(nextName)) {
        index += 1
        nextName = `${baseName} (${index})${extension}`
    }

    usedFileNames.add(nextName)
    return nextName
}

export class DocumentOriginalFiles {
    constructor(
        private readonly documents: Pick<KnowledgeDocumentService, 'findOne' | 'findAll'>,
        private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver
    ) {}

    async getOriginalFileDownload(id: string) {
        const document = await this.documents.findOne(id)
        const target = await this.getOriginalFileDownloadTarget(document, new Set(), new Set())
        if (!target) {
            throw new BadRequestException('Original file is not available for this knowledge document')
        }

        return {
            ...target,
            content: await this.readOriginalFileContent(target)
        }
    }

    async getOriginalFilePreviewTarget(id: string): Promise<OriginalFileDownloadTarget> {
        const document = await this.documents.findOne(id)
        const target = await this.getOriginalFileDownloadTarget(document, new Set(), new Set())
        if (!target) {
            throw new BadRequestException('Original file is not available for this knowledge document')
        }
        return target
    }

    async getOriginalFileDownloadTargets(ids: string[]) {
        const uniqueIds = uniq((ids ?? []).filter((id) => typeof id === 'string' && !!id.trim()).map((id) => id.trim()))
        if (!uniqueIds.length) {
            return []
        }

        const { items } = await this.documents.findAll({
            where: {
                id: In(uniqueIds)
            }
        })

        const usedFileNames = new Set<string>()
        const usedFilePaths = new Set<string>()
        const targets: OriginalFileDownloadTarget[] = []

        for (const document of items) {
            const target = await this.getOriginalFileDownloadTarget(document, usedFileNames, usedFilePaths)
            if (target) {
                targets.push(target)
            }
        }

        return targets
    }

    async getOriginalFileDownloads(ids: string[]): Promise<OriginalFileDownload[]> {
        const targets = await this.getOriginalFileDownloadTargets(ids)
        return Promise.all(
            targets.map(async (target) => ({
                ...target,
                content: await this.readOriginalFileContent(target)
            }))
        )
    }

    private async getOriginalFileDownloadTarget(
        document: IKnowledgeDocument,
        usedFileNames: Set<string>,
        usedFilePaths: Set<string>
    ): Promise<OriginalFileDownloadTarget | null> {
        if (
            !document ||
            document.sourceType === KDocumentSourceType.FOLDER ||
            document.metadata?.systemManaged === true
        ) {
            return null
        }

        return await this.resolveOriginalWorkspaceFileTarget(document, usedFileNames, usedFilePaths)
    }

    private async resolveOriginalWorkspaceFileTarget(
        document: IKnowledgeDocument,
        usedFileNames: Set<string>,
        usedFilePaths: Set<string>
    ): Promise<OriginalFileDownloadTarget | null> {
        const filePath = typeof document.filePath === 'string' ? document.filePath.trim() : ''
        if (!filePath || !document.knowledgebaseId) {
            return null
        }

        const fileIdentity = `workspace:${document.knowledgebaseId}:${filePath}`
        if (usedFilePaths.has(fileIdentity)) {
            return null
        }

        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId: document.knowledgebaseId
        })
        usedFilePaths.add(fileIdentity)

        return {
            absolutePath: workArea.volume.path(filePath),
            fileName: getUniqueFileName(
                document.name || path.basename(filePath) || `${document.id}.download`,
                usedFileNames
            ),
            mimeType: document.mimeType || 'application/octet-stream'
        }
    }

    private async readOriginalFileContent(target: OriginalFileDownloadTarget) {
        return await fsPromises.readFile(target.absolutePath)
    }
}
