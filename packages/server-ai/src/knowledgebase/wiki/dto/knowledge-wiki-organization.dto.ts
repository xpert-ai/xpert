import { Transform, Type } from 'class-transformer'
import { PickType } from '@nestjs/swagger'
import { KnowledgeWikiPageListQueryDTO } from './knowledge-wiki-page-list-query.dto'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    ValidateIf
} from 'class-validator'
import type { KnowledgeWikiFolderInput, KnowledgeWikiGraphParams, KnowledgeWikiPageType } from '@xpert-ai/contracts'

export class WikiTaxonomyConfigDTO {
    @IsBoolean() enabled: boolean
    @IsInt() @Min(0) revision: number
}
export class WikiTaxonomyQueryDTO extends PickType(KnowledgeWikiPageListQueryDTO, [
    'search',
    'pageType',
    'pageGroup'
] as const) {}
export class WikiFolderDTO implements KnowledgeWikiFolderInput {
    @IsString() @MaxLength(120) name: string
    @IsString() @MaxLength(1000) description = ''
    @ValidateIf((_object, value) => value !== null) @IsUUID() parentId: string | null = null
    @IsInt() @Min(0) @Max(10000) position = 0
    @IsOptional() @IsInt() @Min(1) version?: number
}
export class WikiPlacementDTO {
    @ValidateIf((_object, value) => value !== null) @IsUUID() folderId: string | null = null
    @IsInt() @Min(0) version: number
}
export class WikiVersionDTO {
    @Type(() => Number) @IsInt() @Min(1) version: number
}
export class WikiClassificationRunDTO {
    @IsBoolean() unclassifiedOnly = true
}
export class WikiClassificationApplyDTO {
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) jobIds: string[]
}
export class WikiClassificationQueryDTO {
    @IsOptional() @IsUUID() runId?: string
}
export class WikiGraphQueryDTO implements KnowledgeWikiGraphParams {
    @IsOptional() @IsUUID() focusPageId?: string
    @Type(() => Number) @IsIn([1, 2]) depth = 1
    @Type(() => Number) @IsInt() @Min(1) @Max(300) take = 150
    @IsOptional() @IsIn(['summary', 'entity', 'concept', 'index']) pageType?: KnowledgeWikiPageType
    @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
    @IsBoolean()
    includeIndex = false
}
