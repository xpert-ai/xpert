import { z } from 'zod'
export const taskViewStateSchema = z.object({
    initialTab: z.enum(['all', 'tree', 'gantt', 'board', 'pipeline']).optional(),
    pipelineInstanceId: z.string().uuid().optional(),
    pipelineRoundId: z.string().uuid().optional(),
    pipelineMode: z.enum(['stage', 'time']).optional(),
    pipelineLane: z.string().max(200).optional(),
    selectedLane: z.string().max(200).optional(),
    showApprovalSteps: z.boolean().optional(),
    onlyBlocked: z.boolean().optional(),
    pipelineScale: z.number().finite().min(0.1).max(2).optional(),
    scrollLeft: z.number().finite().min(0).optional(),
    scrollTop: z.number().finite().min(0).optional()
})
export type TaskViewState = z.infer<typeof taskViewStateSchema>
export function restoreTaskView(
    saved: unknown,
    parameters?: {
        initialTab?: string
        pipelineInstanceId?: string
        pipelineRoundId?: string
        pipelineNodeId?: string
    }
): TaskViewState {
    const state = taskViewStateSchema.safeParse(saved)
    const restored = state.success ? state.data : {}
    const explicit = parameters?.pipelineInstanceId || parameters?.pipelineRoundId || parameters?.pipelineNodeId
    const samePipeline =
        !!parameters?.pipelineInstanceId &&
        parameters.pipelineInstanceId === restored.pipelineInstanceId &&
        parameters.pipelineRoundId === restored.pipelineRoundId &&
        !parameters.pipelineNodeId
    return {
        ...(!explicit || samePipeline ? restored : {}),
        ...taskViewStateSchema.parse({
            ...(parameters?.initialTab && ['all', 'tree', 'gantt', 'board', 'pipeline'].includes(parameters.initialTab)
                ? { initialTab: parameters.initialTab }
                : {}),
            ...(parameters?.pipelineInstanceId ? { pipelineInstanceId: parameters.pipelineInstanceId } : {}),
            ...(parameters?.pipelineRoundId ? { pipelineRoundId: parameters.pipelineRoundId } : {})
        })
    }
}
