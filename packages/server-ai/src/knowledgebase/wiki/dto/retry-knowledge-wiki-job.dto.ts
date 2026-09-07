import { IsBoolean, IsOptional } from 'class-validator'

export class RetryKnowledgeWikiJobDTO {
    @IsOptional()
    @IsBoolean()
    confirmAdditionalModelCharge?: boolean
}
