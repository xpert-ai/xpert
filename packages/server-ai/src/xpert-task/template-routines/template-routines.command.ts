import { Command } from '@nestjs/cqrs'
import { z } from 'zod'
import type { TemplateRoutineStatus } from '@xpert-ai/contracts'

export const templateRoutineUpdateSchema = z
    .object({
        enabled: z.boolean(),
        expression: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .refine((value) => value.split(/\s+/).length === 5),
        timeZone: z.string().min(1).max(100)
    })
    .strict()
export type TemplateRoutineUpdate = z.output<typeof templateRoutineUpdateSchema>

/** Configure one per-user routine using the normal scheduler; never start it during template import. */
export class TemplateRoutinesCommand extends Command<TemplateRoutineStatus[]> {
    constructor(
        readonly assistantId: string,
        readonly update?: TemplateRoutineUpdate & { key: string }
    ) {
        super()
    }
}
