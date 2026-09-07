import { ICopilotModel, IKnowledgebase, KnowledgebaseWikiConfig } from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator'

export class UpdateKnowledgeWikiConfigDTO {
    @ApiPropertyOptional({
        type: () => Object,
        description: 'Ordinary settings to validate and save together with Wiki configuration'
    })
    @IsObject()
    @IsOptional()
    settings?: Partial<IKnowledgebase>

    @ApiProperty({ type: () => Object })
    @IsObject()
    wikiConfig: KnowledgebaseWikiConfig

    @ApiPropertyOptional({
        type: () => Object,
        nullable: true,
        description: 'Dedicated Wiki generation model; null clears it and falls back to the general LLM'
    })
    @IsObject()
    @IsOptional()
    wikiModel?: ICopilotModel | null

    @ApiPropertyOptional({
        type: Boolean,
        description: 'Confirms the bounded model cost when this change requires rebuilding a non-empty Wiki'
    })
    @IsBoolean()
    @IsOptional()
    confirmModelCharges?: boolean

    @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 10_000 })
    @IsInt()
    @Min(1)
    @Max(10_000)
    @IsOptional()
    maxModelInvocations?: number

    @ApiPropertyOptional({ type: Number, minimum: 1_000, maximum: 100_000_000 })
    @IsInt()
    @Min(1_000)
    @Max(100_000_000)
    @IsOptional()
    maxEstimatedTokens?: number
}
