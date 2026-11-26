import { z } from 'zod/v3'

export const pipelineWorkbenchFocusSchema = z
    .object({
        pipelineInstanceId: z.string().uuid().optional(),
        pipelineRoundId: z.string().uuid().optional(),
        pipelineNodeId: z.string().uuid().optional()
    })
    .strict()
    .refine((value) => {
        const focus = [value.pipelineInstanceId, value.pipelineRoundId, value.pipelineNodeId]
        return focus.every((id) => id === undefined) || focus.every(Boolean)
    })

export type PipelineWorkbenchFocus = z.output<typeof pipelineWorkbenchFocusSchema>
