import {
    DocumentTypeEnum,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
    KDocumentSourceType,
    KnowledgeStructureEnum,
    KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Raw } from 'typeorm'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { KnowledgebaseService } from '../../knowledgebase.service'
import {
    AGENT_WRITER_SYSTEM_MANAGED_TYPE,
    getAgentWriterDocumentName,
    getAgentWriterDocumentPath,
    getAgentWriterManagedDocumentPath
} from '../../agent-knowledge-writer.constants'
import { WriteAgentKnowledgeChunkCommand } from '../write-agent-knowledge-chunk.command'

type TSystemManagedDocumentMetadata = {
    systemManaged: true
    systemManagedType: typeof AGENT_WRITER_SYSTEM_MANAGED_TYPE
    ownerXpertId: string
    ownerAgentKey: string
    managedDocumentKey?: string
}

@Injectable()
@CommandHandler(WriteAgentKnowledgeChunkCommand)
export class WriteAgentKnowledgeChunkHandler implements ICommandHandler<WriteAgentKnowledgeChunkCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly chunkService: KnowledgeDocumentChunkService
    ) {}

    async execute(command: WriteAgentKnowledgeChunkCommand): Promise<{
        status: 'created' | 'skipped'
        knowledgebaseId: string
        knowledgebaseName: string
        documentId: string
        writeKey: string
    }> {
        const {
            knowledgebaseIds,
            knowledgebaseId,
            xpertId,
            agentKey,
            text,
            title,
            metadata,
            writeKey,
            document: documentTarget,
            executionId,
            threadId
        } = command.input

        if (!knowledgebaseIds.includes(knowledgebaseId)) {
            throw new BadRequestException(`Knowledgebase '${knowledgebaseId}' is not connected to agent '${agentKey}'`)
        }

        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
            select: {
                id: true,
                name: true,
                type: true,
                structure: true,
                copilotModelId: true,
                workspaceId: true,
                tenantId: true,
                organizationId: true
            }
        })

        if (knowledgebase.type === KnowledgebaseTypeEnum.External) {
            throw new BadRequestException(`Knowledgebase '${knowledgebase.name}' does not support agent chunk writes`)
        }

        if (!knowledgebase.copilotModelId) {
            throw new BadRequestException(`Knowledgebase '${knowledgebase.name}' has no embedding model configured`)
        }

        if (knowledgebase.structure === KnowledgeStructureEnum.ParentChild) {
            throw new BadRequestException(
                `Knowledgebase '${knowledgebase.name}' does not support agent chunk writes for '${KnowledgeStructureEnum.ParentChild}' structure`
            )
        }

        const document = await this.findOrCreateAgentDocument(
            knowledgebaseId,
            xpertId,
            agentKey,
            normalizeManagedDocumentTarget(documentTarget)
        )

        const existingChunk = await this.findExistingChunk(document.id, writeKey)

        if (existingChunk) {
            return {
                status: 'skipped',
                knowledgebaseId: knowledgebase.id,
                knowledgebaseName: knowledgebase.name,
                documentId: document.id,
                writeKey
            }
        }

        await this.documentService.createChunk(document.id, {
            pageContent: text,
            metadata: {
                ...(metadata ?? {}),
                ...(title ? { title } : {}),
                chunkId: writeKey,
                writeKey,
                executionId,
                threadId,
                ownerAgentKey: agentKey,
                ownerXpertId: xpertId
            }
        })

        return {
            status: 'created',
            knowledgebaseId: knowledgebase.id,
            knowledgebaseName: knowledgebase.name,
            documentId: document.id,
            writeKey
        }
    }

    private async findOrCreateAgentDocument(
        knowledgebaseId: string,
        xpertId: string,
        agentKey: string,
        target?: { key: string; name: string; parentId: string | null; metadata: Record<string, unknown> }
    ) {
        const existingDocument = await this.findExistingAgentDocument(knowledgebaseId, xpertId, agentKey, target?.key)

        if (existingDocument) {
            if (!target) return existingDocument
            return this.reconcileManagedDocument(existingDocument, knowledgebaseId, xpertId, agentKey, target)
        }

        const documentMetadata: TSystemManagedDocumentMetadata = {
            ...(target?.metadata ?? {}),
            systemManaged: true,
            systemManagedType: AGENT_WRITER_SYSTEM_MANAGED_TYPE,
            ownerXpertId: xpertId,
            ownerAgentKey: agentKey,
            ...(target ? { managedDocumentKey: target.key } : {})
        }
        const parent = target?.parentId
            ? await this.documentService.findOne(target.parentId, { relations: ['parent'] })
            : null
        if (
            parent &&
            (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER)
        ) {
            throw new BadRequestException(
                'Managed document parentId must point to a folder in the selected knowledgebase'
            )
        }

        return this.documentService.createDocument({
            knowledgebaseId,
            parent,
            name: target?.name ?? getAgentWriterDocumentName(agentKey),
            filePath: target
                ? getAgentWriterManagedDocumentPath(agentKey, target.key)
                : getAgentWriterDocumentPath(agentKey),
            category: KBDocumentCategoryEnum.Text,
            sourceType: DocumentTypeEnum.FILE,
            type: 'txt',
            mimeType: 'text/plain',
            status: KBDocumentStatusEnum.FINISH,
            metadata: documentMetadata
        })
    }

    private async reconcileManagedDocument(
        existingDocument: Awaited<ReturnType<KnowledgeDocumentService['findOneByOptions']>>,
        knowledgebaseId: string,
        xpertId: string,
        agentKey: string,
        target: { key: string; name: string; parentId: string | null; metadata: Record<string, unknown> }
    ) {
        let document = existingDocument
        if ((document.parent?.id ?? null) !== target.parentId) {
            const moved = await this.documentService.moveDocument({
                knowledgebaseId,
                documentId: document.id,
                parentId: target.parentId,
                expectedVersion: document.version
            })
            document = moved.document
        }
        const metadata: TSystemManagedDocumentMetadata = {
            ...target.metadata,
            systemManaged: true,
            systemManagedType: AGENT_WRITER_SYSTEM_MANAGED_TYPE,
            ownerXpertId: xpertId,
            ownerAgentKey: agentKey,
            managedDocumentKey: target.key
        }
        if (document.name !== target.name || JSON.stringify(document.metadata ?? {}) !== JSON.stringify(metadata)) {
            await this.documentService.updateWithVersion(document.id, { name: target.name, metadata }, document.version)
            document = await this.documentService.findOne(document.id, { relations: ['parent'] })
        }
        return document
    }

    private async findExistingChunk(documentId: string, writeKey: string) {
        try {
            return await this.chunkService.findOneByOptions({
                where: {
                    documentId,
                    metadata: Raw((alias) => `COALESCE((${alias})::jsonb ->> 'writeKey', '') = :writeKey`, { writeKey })
                }
            })
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null
            }

            throw error
        }
    }

    private async findExistingAgentDocument(
        knowledgebaseId: string,
        xpertId: string,
        agentKey: string,
        documentKey?: string
    ) {
        try {
            return await this.documentService.findOneByOptions({
                where: {
                    knowledgebaseId,
                    metadata: Raw(
                        (alias) =>
                            [
                                `COALESCE((${alias})::jsonb ->> 'systemManagedType', '') = :systemManagedType`,
                                `COALESCE((${alias})::jsonb ->> 'ownerXpertId', '') = :ownerXpertId`,
                                `COALESCE((${alias})::jsonb ->> 'ownerAgentKey', '') = :ownerAgentKey`,
                                `COALESCE((${alias})::jsonb ->> 'managedDocumentKey', '') = :managedDocumentKey`
                            ].join(' AND '),
                        {
                            systemManagedType: AGENT_WRITER_SYSTEM_MANAGED_TYPE,
                            ownerXpertId: xpertId,
                            ownerAgentKey: agentKey,
                            managedDocumentKey: documentKey ?? ''
                        }
                    )
                },
                relations: ['parent']
            })
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null
            }

            throw error
        }
    }
}

function normalizeManagedDocumentTarget(
    value: WriteAgentKnowledgeChunkCommand['input']['document']
): { key: string; name: string; parentId: string | null; metadata: Record<string, unknown> } | undefined {
    if (!value) return undefined
    const key = value.key?.trim()
    const name = value.name?.trim()
    if (!key || key.length > 500)
        throw new BadRequestException('Managed document key is required and must not exceed 500 characters')
    if (!name || name.length > 300)
        throw new BadRequestException('Managed document name is required and must not exceed 300 characters')
    return { key, name, parentId: value.parentId?.trim() || null, metadata: value.metadata ?? {} }
}
