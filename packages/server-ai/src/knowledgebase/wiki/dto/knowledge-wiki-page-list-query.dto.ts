import {
    KNOWLEDGE_WIKI_DEFAULT_PAGE_SIZE,
    KNOWLEDGE_WIKI_MAX_PAGE_SIZE,
    KNOWLEDGE_WIKI_MAX_SEARCH_LENGTH,
    KnowledgeWikiPageListParams,
    KnowledgeWikiPageStatus,
    KnowledgeWikiPageType
} from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

const KNOWLEDGE_WIKI_PAGE_TYPES: KnowledgeWikiPageType[] = ['summary', 'entity', 'concept', 'index']
const KNOWLEDGE_WIKI_PAGE_STATUSES: KnowledgeWikiPageStatus[] = ['building', 'ready', 'stale', 'failed', 'archived']

export class KnowledgeWikiPageListQueryDTO implements KnowledgeWikiPageListParams {
    @ApiPropertyOptional({ type: String, maxLength: KNOWLEDGE_WIKI_MAX_SEARCH_LENGTH })
    @IsString()
    @MaxLength(KNOWLEDGE_WIKI_MAX_SEARCH_LENGTH)
    @IsOptional()
    search?: string

    @ApiPropertyOptional({ enum: KNOWLEDGE_WIKI_PAGE_TYPES })
    @IsIn(KNOWLEDGE_WIKI_PAGE_TYPES)
    @IsOptional()
    pageType?: KnowledgeWikiPageType

    @ApiPropertyOptional({ enum: KNOWLEDGE_WIKI_PAGE_STATUSES })
    @IsIn(KNOWLEDGE_WIKI_PAGE_STATUSES)
    @IsOptional()
    status?: KnowledgeWikiPageStatus

    @ApiPropertyOptional({ type: Number, minimum: 0, default: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @IsOptional()
    skip?: number

    @ApiPropertyOptional({
        type: Number,
        minimum: 1,
        maximum: KNOWLEDGE_WIKI_MAX_PAGE_SIZE,
        default: KNOWLEDGE_WIKI_DEFAULT_PAGE_SIZE
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(KNOWLEDGE_WIKI_MAX_PAGE_SIZE)
    @IsOptional()
    take?: number
}
