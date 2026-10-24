import { z } from 'zod'
import { request } from '../bridge'

const result = z.object({ success: z.boolean() })
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const workspace = z.object({
    success: z.literal(true),
    data: z.object({
        target: z.enum(['workbench.view', 'assistant.project']),
        projectId: z.string().uuid(),
        xpertId: z.string(),
        viewKey: z.string().min(1),
        selectionId: z.string().optional(),
        parameters: z.record(z.union([scalar, z.array(scalar)])).optional()
    })
})

/** The host resolves registered Project entries; callers cannot supply a URL, Assistant or business view. */
export async function openProjectWorkspace(
    projectId: string,
    destination: 'application' | 'pipelines',
    failureMessage: string,
    pipelineNodeId?: string,
    instanceId?: string,
    roundId?: string
) {
    const id = z.string().uuid().parse(projectId)
    if (pipelineNodeId && destination !== 'application') throw Error(failureMessage)
    const focus = {
        ...(roundId ? { roundId: z.string().uuid().parse(roundId) } : {}),
        ...(pipelineNodeId ? { pipelineNodeId: z.string().uuid().parse(pipelineNodeId) } : {}),
        ...(instanceId ? { instanceId: z.string().uuid().parse(instanceId) } : {})
    }
    const resolved =
        destination === 'application'
            ? workspace.parse(
                  await request('executeAction', {
                      actionKey: 'workspace-target',
                      input: focus
                  })
              ).data
            : { target: 'project.pipelines', projectId: id }
    if (resolved.projectId !== id) throw Error(failureMessage)
    const response = result.safeParse(
        await request('invokeClientCommand', {
            commandKey: 'workbench.navigation.open',
            payload: resolved
        })
    )
    if (!response.success || !response.data.success) throw Error(failureMessage)
}
