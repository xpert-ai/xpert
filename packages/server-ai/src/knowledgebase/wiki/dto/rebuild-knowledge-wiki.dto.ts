import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator'

export class RebuildKnowledgeWikiDTO {
    @IsBoolean()
    confirmModelCharges: boolean

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10_000)
    maxModelInvocations?: number

    @IsOptional()
    @IsInt()
    @Min(1_000)
    @Max(100_000_000)
    maxEstimatedTokens?: number
}
