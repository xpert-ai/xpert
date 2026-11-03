import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

export const modelParameterRulesSchema = z
    .object({
        model: z.string().trim().min(1),
        modelType: z.nativeEnum(AiModelTypeEnum)
    })
    .strict()

export type ModelParameterRulesInput = z.output<typeof modelParameterRulesSchema>
