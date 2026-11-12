import { z } from 'zod'
import type { ChatGroupProjectInput } from '@xpert-ai/contracts'

export const groupProjectSchema = z
    .object({
        project: z.discriminatedUnion('mode', [
            z
                .object({
                    mode: z.literal('create'),
                    id: z.string().uuid(),
                    name: z.string().trim().min(1).max(120),
                    projectType: z
                        .object({
                            applicationKey: z.string().trim().min(1).max(300),
                            projectTypeKey: z.string().trim().min(1).max(100)
                        })
                        .strict()
                        .optional()
                })
                .strict(),
            z
                .object({
                    mode: z.literal('existing'),
                    projectId: z.string().uuid(),
                    reuse: z.literal(true).optional()
                })
                .strict()
        ]),
        participantIds: z
            .array(z.string().uuid())
            .min(1)
            .max(16)
            .refine((ids) => new Set(ids).size === ids.length)
    })
    .strict()
    .transform((input) => input as ChatGroupProjectInput)
