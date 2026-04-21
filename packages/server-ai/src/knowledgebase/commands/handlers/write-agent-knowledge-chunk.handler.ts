import {
    DocumentTypeEnum,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
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
    getAgentWriterDocumentPath
} from '../../agent-knowledge-writer.constants'
import { WriteAgentKnowledgeChunkCommand } from '../write-agent-knowledge-chunk.command'

type TSystemManagedDocumentMetadata = {
    systemManaged: true
    systemManagedType: typeof AGENT_WRITER_SYSTEM_MANAGED_TYPE
    ownerXpertId: string
    ownerAgentKey: string
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
        const { knowledgebaseIds, knowledgebaseId, xpertId, agentKey, text, title, metadata, writeKey, executionId, threadId } =
            command.input

        if (!knowledgebaseIds.includes(knowledgebaseId)) {
            throw new BadRequestException(`Knowledgebase '${knowledgebaseId}' is not connected to agent '${agentKey}'`)
        }

        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
            select: {
                id: true,
                name: true,
                type: true,
                structure: true,
                copilotModelId: true
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

        const document = await this.findOrCreateAgentDocument(knowledgebaseId, xpertId, agentKey)

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

    private async findOrCreateAgentDocument(knowledgebaseId: string, xpertId: string, agentKey: string) {
        const existingDocument = await this.findExistingAgentDocument(knowledgebaseId, xpertId, agentKey)

        if (existingDocument) {
            return existingDocument
        }

        const documentMetadata: TSystemManagedDocumentMetadata = {
            systemManaged: true,
            systemManagedType: AGENT_WRITER_SYSTEM_MANAGED_TYPE,
            ownerXpertId: xpertId,
            ownerAgentKey: agentKey
        }

        return this.documentService.createDocument({
            knowledgebaseId,
            name: getAgentWriterDocumentName(agentKey),
            filePath: getAgentWriterDocumentPath(agentKey),
            category: KBDocumentCategoryEnum.Text,
            sourceType: DocumentTypeEnum.FILE,
            type: 'txt',
            mimeType: 'text/plain',
            status: KBDocumentStatusEnum.FINISH,
            metadata: documentMetadata
        })
    }

    private async findExistingChunk(documentId: string, writeKey: string) {
        try {
            return await this.chunkService.findOneByOptions({
                where: {
                    documentId,
                    metadata: Raw(
                        (alias) => `COALESCE((${alias})::jsonb ->> 'writeKey', '') = :writeKey`,
                        { writeKey }
                    )
                }
            })
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null
            }

            throw error
        }
    }

    private async findExistingAgentDocument(knowledgebaseId: string, xpertId: string, agentKey: string) {
        try {
            return await this.documentService.findOneByOptions({
                where: {
                    knowledgebaseId,
                    metadata: Raw(
                        (alias) =>
                            [
                                `COALESCE((${alias})::jsonb ->> 'systemManagedType', '') = :systemManagedType`,
                                `COALESCE((${alias})::jsonb ->> 'ownerXpertId', '') = :ownerXpertId`,
                                `COALESCE((${alias})::jsonb ->> 'ownerAgentKey', '') = :ownerAgentKey`
                            ].join(' AND '),
                        {
                            systemManagedType: AGENT_WRITER_SYSTEM_MANAGED_TYPE,
                            ownerXpertId: xpertId,
                            ownerAgentKey: agentKey
                        }
                    )
                }
            })
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null
            }

            throw error
        }
    }
}
