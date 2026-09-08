import { KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE } from '@xpert-ai/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator'

export class KnowledgeWikiDocumentStatusQueryDTO {
    @ApiProperty({ type: String, description: 'Comma-separated document UUIDs' })
    @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(KNOWLEDGE_WIKI_DOCUMENT_STATUS_BATCH_SIZE)
    @IsUUID('all', { each: true })
    documentIds: string[]
}
