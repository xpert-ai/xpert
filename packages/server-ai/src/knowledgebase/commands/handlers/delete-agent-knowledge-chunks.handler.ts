import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Raw } from 'typeorm'
import type { FindOptionsWhere } from 'typeorm'
import { KnowledgeDocumentChunk } from '../../../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../../../knowledge-document/document.service'
import { AGENT_WRITER_SYSTEM_MANAGED_TYPE } from '../../agent-knowledge-writer.constants'
import { DeleteAgentKnowledgeChunksCommand } from '../delete-agent-knowledge-chunks.command'

@Injectable()
@CommandHandler(DeleteAgentKnowledgeChunksCommand)
export class DeleteAgentKnowledgeChunksHandler implements ICommandHandler<DeleteAgentKnowledgeChunksCommand> {
    constructor(
        private readonly documentService: KnowledgeDocumentService,
        private readonly chunkService: KnowledgeDocumentChunkService
    ) {}

    async execute(command: DeleteAgentKnowledgeChunksCommand): Promise<{
        deletedCount: number
        knowledgebaseId: string
        documentId?: string
        writeKeys?: string[]
        writeKeyPrefix?: string
    }> {
        const { knowledgebaseIds, knowledgebaseId, xpertId, agentKey, writeKeyPrefix } = command.input
        const writeKeys = uniqueStrings(command.input.writeKeys)
        const normalizedPrefix = normalizeOptionalString(writeKeyPrefix)

        if (!knowledgebaseIds.includes(knowledgebaseId)) {
            throw new BadRequestException(`Knowledgebase '${knowledgebaseId}' is not connected to agent '${agentKey}'`)
        }
        if (!writeKeys.length && !normalizedPrefix) {
            throw new BadRequestException('writeKeys or writeKeyPrefix is required')
        }

        const document = await this.findExistingAgentDocument(knowledgebaseId, xpertId, agentKey)
        if (!document?.id) {
            return {
                deletedCount: 0,
                knowledgebaseId,
                ...(writeKeys.length ? { writeKeys } : {}),
                ...(normalizedPrefix ? { writeKeyPrefix: normalizedPrefix } : {})
            }
        }

        const where: FindOptionsWhere<KnowledgeDocumentChunk>[] = []
        if (writeKeys.length) {
            where.push({
                documentId: document.id,
                metadata: Raw((alias) => `COALESCE((${alias})::jsonb ->> 'writeKey', '') IN (:...writeKeys)`, {
                    writeKeys
                })
            })
        }
        if (normalizedPrefix) {
            where.push({
                documentId: document.id,
                metadata: Raw(
                    (alias) => `COALESCE((${alias})::jsonb ->> 'writeKey', '') LIKE :writeKeyPrefix ESCAPE '\\'`,
                    { writeKeyPrefix: `${escapeLike(normalizedPrefix)}%` }
                )
            })
        }

        const { items } = await this.chunkService.findAll({ where })
        for (const chunk of items) {
            if (chunk.id) {
                await this.documentService.deleteChunk(document.id, chunk.id)
            }
        }

        return {
            deletedCount: items.filter((chunk) => Boolean(chunk.id)).length,
            knowledgebaseId,
            documentId: document.id,
            ...(writeKeys.length ? { writeKeys } : {}),
            ...(normalizedPrefix ? { writeKeyPrefix: normalizedPrefix } : {})
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

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[] | undefined) {
    return Array.from(new Set((values ?? []).map(normalizeOptionalString).filter((value): value is string => !!value)))
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}
