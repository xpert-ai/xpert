import { AiModelTypeEnum, TemplateInstallationInput } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const json: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)])
)
const basic = z
    .object({
        name: z.string().trim().min(5).max(160).optional(),
        title: z.string().max(200).optional(),
        description: z.string().max(10000).optional(),
        prompt: z.string().max(100000).optional(),
        workspaceDataScope: z.enum(['shared', 'user']).optional(),
        avatar: z
            .object({
                url: z.string().max(4000).optional(),
                background: z.string().max(100).optional(),
                useNotoColor: z.boolean().optional(),
                emoji: z
                    .object({
                        id: z.string().max(100),
                        set: z.enum(['', 'apple', 'google', 'twitter', 'facebook']).optional(),
                        colons: z.string().max(100).optional(),
                        unified: z.string().max(100).optional()
                    })
                    .strict()
                    .optional()
            })
            .strict()
            .optional(),
        copilotModel: z
            .object({
                copilotId: z.string().uuid(),
                model: z.string().trim().min(1).max(1000),
                modelType: z.literal(AiModelTypeEnum.LLM).optional(),
                options: z.record(json).optional()
            })
            .strict()
            .optional(),
        realtimeVoice: z
            .object({
                modelId: z.string().min(1).max(1000),
                voice: z
                    .string()
                    .min(1)
                    .max(160)
                    .regex(/^[a-zA-Z0-9_-]+$/)
            })
            .strict()
            .optional()
    })
    .strict()

export const templateInstallationInputSchema = z
    .object({
        idempotencyKey: z
            .string()
            .trim()
            .min(8)
            .max(128)
            .regex(/^[\w.-]+$/),
        templateId: z.string().trim().min(1).max(1000),
        workspaceId: z.string().uuid(),
        publish: z.boolean().default(false),
        locale: z.string().trim().min(2).max(40).optional(),
        capabilities: z
            .array(z.string().trim().min(1).max(160))
            .max(32)
            .default([])
            .transform((items) => [...new Set(items)].sort()),
        basic: basic.optional()
    })
    .strict()
export type InstallationInput = Omit<TemplateInstallationInput, 'publish' | 'capabilities'> & {
    publish: boolean
    capabilities: string[]
}
export const installationIdSchema = z.string().uuid()
export const installationListSchema = z
    .object({
        workspaceId: z.string().uuid(),
        take: z.coerce.number().int().min(1).max(100).default(20),
        skip: z.coerce.number().int().min(0).max(100000).default(0)
    })
    .strict()
export type InstallationList = z.output<typeof installationListSchema>
export const installationRetrySchema = z.object({}).strict()
