import {
    KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT,
    KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT,
    KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT,
    KnowledgeFAQUpdateInput,
    KnowledgeFAQWriteInput
} from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class CreateKnowledgeFAQDTO implements KnowledgeFAQWriteInput {
    @ApiProperty({ maxLength: 500 })
    @IsString()
    standardQuestion: string

    @ApiPropertyOptional({ type: [String], maxItems: KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT })
    @IsArray()
    @ArrayMaxSize(KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT)
    @IsString({ each: true })
    @IsOptional()
    similarQuestions?: string[]

    @ApiPropertyOptional({ type: [String], maxItems: KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT })
    @IsArray()
    @ArrayMaxSize(KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT)
    @IsString({ each: true })
    @IsOptional()
    negativeQuestions?: string[]

    @ApiProperty({ type: [String], minItems: 1, maxItems: KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT)
    @IsString({ each: true })
    answerBlocks: string[]

    @ApiPropertyOptional({ default: true })
    @IsBoolean()
    @IsOptional()
    enabled?: boolean
}

export class UpdateKnowledgeFAQDTO extends CreateKnowledgeFAQDTO implements KnowledgeFAQUpdateInput {
    @ApiProperty({ minimum: 1 })
    @IsInt()
    @Min(1)
    version: number
}
